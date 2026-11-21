// Fast drop-in for csv-reader 1.0.0 (make.fun's own CSV reader).
//
// Exact answers, one indexOf-driven pass. The reference walks the text a
// character at a time and builds every field by concatenation; this reader
// jumps between delimiters with String#indexOf (C speed) and slices each
// plain field out whole, so the common case — an unquoted field with no CR
// in it — costs two short scans and one slice. The slow paths (a stray CR
// inside an unquoted field, a CR inside quotes, a quote that never closes,
// junk after a closing quote) run the same logic the reference runs, only
// on the few fields that need them.
//
// Semantics (csv-reader 1.0.0, kept byte for byte):
//   - U+FEFF at the very start is dropped.
//   - A record ends at LF or CRLF; a line left with no characters is no record.
//   - Outside quotes a CR not followed by LF is dropped (stray_cr).
//   - A field opening with a quote runs to the next quote that is not doubled;
//     "" inside it is one quote; each CRLF or lone CR inside it reads as LF;
//     what follows its closing quote, up to the next comma or line break, is
//     appended as it stands (quote_junk, when the field ends); a quote that
//     never closes is a literal character and the text after it is read again
//     as unquoted (unterminated_quote).
//   - A quote inside an unquoted field is a literal character.
//   - Fields stay strings, never trimmed or converted.
//   - columns is the first record when header is true, else null; rows holds
//     the records after it, each padded (short_row, with fields: its field
//     count) or cut (long_row, with extra: the cut fields) to the first
//     record's width.
//   - Each error is {code, line, row}, in the order met; line is the 1-based
//     line its record starts on, counting every LF, CRLF and lone CR inside
//     quotes, and row is its record's index in rows, null for the header.

/** How a field ended: at a comma, at a line break, or at the end of the text. */
const COMMA = 0;
const LINE_BREAK = 1;
const END = 2;

/** csv-reader 1.0.0's answer for one case's input {text, header}. */
export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const n = text.length;
  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;

  let pos = 0; // the next character to read
  let line = 1; // the line that character is on
  if (n > 0 && text.charCodeAt(0) === 0xfeff) pos = 1;

  // The record being read: the line it starts on and the index in rows it takes (null: the header).
  let recordLine = 1;
  let recordRow = null;

  // Reads unquoted characters from pos onto `init`, up to the next comma or
  // line break: a CR not followed by LF is dropped (stray_cr). Returns the
  // field and how it ended; `added` counts the characters kept. Mutates pos/line.
  function readUnquoted(init) {
    let value = init;
    let added = 0;
    for (;;) {
      if (pos >= n) return { value, ended: END, added };
      const cIdx = text.indexOf(',', pos);
      const nIdx = text.indexOf('\n', pos);
      let end;
      let ended;
      if (cIdx !== -1 && (nIdx === -1 || cIdx < nIdx)) {
        end = cIdx;
        ended = COMMA;
      } else if (nIdx !== -1) {
        end = nIdx;
        ended = LINE_BREAK;
      } else {
        end = n;
        ended = END;
      }
      const seg = text.slice(pos, end);
      const r = seg.indexOf('\r');
      if (r === -1) {
        if (seg.length > 0) {
          value += seg;
          added += seg.length;
        }
        if (ended === COMMA) pos = end + 1;
        else if (ended === LINE_BREAK) {
          pos = end + 1;
          line += 1;
        } else {
          pos = end;
        }
        return { value, ended, added };
      }
      if (ended === LINE_BREAK && r === seg.length - 1) {
        // The segment's only CR sits right before the LF: a CRLF line break.
        if (seg.length > 1) {
          value += seg.slice(0, -1);
          added += seg.length - 1;
        }
        pos = end + 1;
        line += 1;
        return { value, ended, added };
      }
      // A stray CR at pos + r: keep what precedes it, drop it, keep scanning.
      if (r > 0) {
        value += seg.slice(0, r);
        added += r;
      }
      errors.push({ code: 'stray_cr', line: recordLine, row: recordRow });
      pos += r + 1;
    }
  }

  // Reads a quoted field whose opening quote is at pos.
  function readQuoted() {
    const open = pos;
    const openLine = line;
    let p = open + 1;
    let segs = null; // segments split by doubled quotes, when any occur
    let segStart = p;
    let q;
    for (;;) {
      q = text.indexOf('"', p);
      if (q === -1) {
        // The quote never closes: it is a literal character, and the text
        // after it is read again as unquoted.
        pos = open + 1;
        line = openLine;
        errors.push({ code: 'unterminated_quote', line: recordLine, row: recordRow });
        return readUnquoted('"');
      }
      if (text.charCodeAt(q + 1) === 34) {
        // A doubled quote: one quote in the value, keep scanning.
        if (segs === null) segs = [];
        segs.push(text.slice(segStart, q));
        p = q + 2;
        segStart = p;
        continue;
      }
      break; // q is the closing quote
    }
    let value;
    if (segs === null) {
      value = text.slice(open + 1, q);
    } else {
      segs.push(text.slice(segStart, q));
      value = segs.join('"');
    }
    // CRLF and a lone CR inside quotes are each one LF; count every line
    // break the quoted field spans, for the records after it.
    if (value.indexOf('\r') !== -1) {
      let out = '';
      let i = 0;
      const m = value.length;
      while (i < m) {
        const ch = value.charCodeAt(i);
        if (ch === 13) {
          out += '\n';
          line += 1;
          i += value.charCodeAt(i + 1) === 10 ? 2 : 1;
        } else {
          if (ch === 10) line += 1;
          out += value[i];
          i += 1;
        }
      }
      value = out;
    } else {
      let np = value.indexOf('\n');
      while (np !== -1) {
        line += 1;
        np = value.indexOf('\n', np + 1);
      }
    }
    pos = q + 1;
    if (pos >= n) return { value, ended: END };
    const c = text.charCodeAt(pos);
    if (c === 44) {
      pos += 1;
      return { value, ended: COMMA };
    }
    if (c === 10) {
      pos += 1;
      line += 1;
      return { value, ended: LINE_BREAK };
    }
    if (c === 13 && text.charCodeAt(pos + 1) === 10) {
      pos += 2;
      line += 1;
      return { value, ended: LINE_BREAK };
    }
    // What follows the closing quote is appended as it stands, up to the
    // next comma or line break.
    const junk = readUnquoted(value);
    if (junk.added > 0) errors.push({ code: 'quote_junk', line: recordLine, row: recordRow });
    return junk;
  }

  while (true) {
    // Lines with no characters are no records.
    while (pos < n) {
      const c = text.charCodeAt(pos);
      if (c === 10) {
        pos += 1;
        line += 1;
      } else if (c === 13 && text.charCodeAt(pos + 1) === 10) {
        pos += 2;
        line += 1;
      } else {
        break;
      }
    }
    if (pos >= n) break;

    recordLine = line;
    recordRow = header && columns === null ? null : rows.length;
    let fields;
    let ended;
    let quoted = false;
    // Fast path: a record with no quote at all holds no quoted field, so its
    // raw span (to the next LF) splits on commas in C. A CR in the span sends
    // the record to the careful path, except one CR right before the LF,
    // which is the file's CRLF line break.
    const eol = text.indexOf('\n', pos);
    const spanEnd = eol === -1 ? n : eol;
    const qi = text.indexOf('"', pos);
    if (qi === -1 || qi >= spanEnd) {
      const span = text.slice(pos, spanEnd);
      const rIdx = span.indexOf('\r');
      if (rIdx === -1) {
        fields = span.split(',');
        if (eol === -1) {
          ended = END;
          pos = n;
        } else {
          ended = LINE_BREAK;
          pos = eol + 1;
          line += 1;
        }
      } else if (rIdx === span.length - 1 && eol !== -1) {
        fields = span.slice(0, -1).split(',');
        ended = LINE_BREAK;
        pos = eol + 1;
        line += 1;
      }
    }
    if (fields === undefined) {
      // The careful path: field by field, as the reference reads them.
      fields = [];
      let fieldVal;
      do {
        if (text.charCodeAt(pos) === 34) {
          quoted = true;
          const f = readQuoted();
          fieldVal = f.value;
          ended = f.ended;
        } else {
          // Unquoted field, inlined: jump to the next comma or line break.
          quoted = false;
          const cIdx = text.indexOf(',', pos);
          const nIdx = text.indexOf('\n', pos);
          let end;
          if (cIdx !== -1 && (nIdx === -1 || cIdx < nIdx)) {
            end = cIdx;
            ended = COMMA;
          } else if (nIdx !== -1) {
            end = nIdx;
            ended = LINE_BREAK;
          } else {
            end = n;
            ended = END;
          }
          const seg = text.slice(pos, end);
          const r = seg.indexOf('\r');
          if (r === -1) {
            fieldVal = seg;
            if (ended === COMMA) pos = end + 1;
            else if (ended === LINE_BREAK) {
              pos = end + 1;
              line += 1;
            } else {
              pos = end;
            }
          } else if (ended === LINE_BREAK && r === seg.length - 1) {
            // CRLF line break: the field stops before the CR.
            fieldVal = seg.slice(0, -1);
            pos = end + 1;
            line += 1;
          } else {
            // A stray CR hides in the field: take the careful path.
            const u = readUnquoted('');
            fieldVal = u.value;
            ended = u.ended;
          }
        }
        fields.push(fieldVal);
      } while (ended === COMMA);
    }

    // A line that held only stray CRs is left with no characters: no record (its stray_cr errors stay).
    if (fields.length === 1 && fields[0] === '' && !quoted) continue;

    if (width < 0) width = fields.length;
    if (header && columns === null) {
      columns = fields;
      continue;
    }
    if (fields.length < width) {
      errors.push({ code: 'short_row', line: recordLine, row: recordRow, fields: fields.length });
      while (fields.length < width) fields.push('');
    } else if (fields.length > width) {
      errors.push({ code: 'long_row', line: recordLine, row: recordRow, extra: fields.splice(width) });
    }
    rows.push(fields);
  }
  return { columns: header ? (columns ?? []) : null, rows, errors };
}
