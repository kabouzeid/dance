import * as vscode from "vscode";

import { moveWhileByCharCode, moveWhileByCharCodeBackward, moveWhileByCharCodeForward, moveWhileReachedDocumentEdge } from "./move";
import { Context } from "../context";
import { isEmpty as lineIsEmpty } from "../lines";
import * as Positions from "../positions";
import { Direction } from "../types";
import { CharSet, getCharSetFunction } from "../../utils/charset";
import { CharCodes } from "../../utils/regexp";

/**
 * A function that, given a position, returns the start of the object to which
 * the position belongs.
 */
export interface SeekStart {
  (position: vscode.Position, inner: boolean, document: vscode.TextDocument): vscode.Position;
}

/**
 * A function that, given a position, returns the end of the object to which
 * the position belongs.
 *
 * If the whole object is being sought, the start position of the object will
 * also be given.
 */
export interface SeekEnd {
  (position: vscode.Position, inner: boolean,
   document: vscode.TextDocument, start?: vscode.Position): vscode.Position;
}

/**
 * A function that, given a position, returns the range of the object to which
 * the position belongs.
 */
export interface Seek {
  (position: vscode.Position, inner: boolean, document: vscode.TextDocument): vscode.Selection;

  readonly start: SeekStart;
  readonly end: SeekEnd;
}

/**
 * Returns the range of the argument at the given position.
 */
export function argument(
  position: vscode.Position,
  inner: boolean,
  document = Context.current.document,
) {
  return new vscode.Selection(
    argumentStart(position, inner, document),
    argumentEnd(position, inner, document),
  );
}

/**
 * Returns the start position of the argument at the given position.
 */
export function argumentStart(
  position: vscode.Position,
  inner: boolean,
  document = Context.current.document,
) {
  return toArgumentEdge(position, inner, Direction.Backward, document);
}

/**
 * Returns the end position of the argument at the given position.
 */
export function argumentEnd(
  position: vscode.Position,
  inner: boolean,
  document = Context.current.document,
) {
  return toArgumentEdge(position, inner, Direction.Forward, document);
}

export declare namespace argument {
  export const start: typeof argumentStart;
  export const end: typeof argumentEnd;
}

Object.defineProperties(argument, {
  start: { value: argumentStart },
  end: { value: argumentEnd },
});

/**
 * Returns the range of lines with the same indent as the line at the given
 * position.
 */
export function indent(
  position: vscode.Position,
  inner: boolean,
  document = Context.current.document,
) {
  // When selecting a whole indent object, scanning separately to start and
  // then to end will lead to wrong results like two different indentation
  // levels and skipping over blank lines more than needed. We can mitigate
  // this by finding the start first and then scan from there to find the end
  // of indent block.
  const start = indentStart(position, inner, document),
        end = indentEnd(start, inner, document);

  return new vscode.Selection(start, end);
}

/**
 * Returns the start position of the indent block at the given position.
 */
export function indentStart(
  position: vscode.Position,
  inner: boolean,
  document = Context.current.document,
) {
  return toIndentEdge(position, inner, Direction.Backward, document);
}

/**
 * Returns the end position of the indent block at the given position.
 */
export function indentEnd(
  position: vscode.Position,
  inner: boolean,
  document = Context.current.document,
  start?: vscode.Position,
) {
  return toIndentEdge(start ?? position, inner, Direction.Forward, document);
}

export declare namespace indent {
  export const start: typeof indentStart;
  export const end: typeof indentEnd;
}

Object.defineProperties(indent, {
  start: { value: indentStart },
  end: { value: indentEnd },
});

/**
 * Returns the range of the paragraph that wraps the given position.
 */
export function paragraph(
  position: vscode.Position,
  inner: boolean,
  document = Context.current.document,
) {
  let start: vscode.Position;

  if (position.line + 1 < document.lineCount
      && lineIsEmpty(position.line, document) && !lineIsEmpty(position.line + 1, document)) {
    // Special case: if current line is empty, check next line and select
    // the NEXT paragraph if next line is not empty.
    start = Positions.lineStart(position.line + 1);
  } else {
    start = toParagraphStart(position, document);
  }

  const end = toParagraphEnd(start, inner, document);

  return new vscode.Selection(start, end);
}

/**
 * Returns the start position of the paragraph that wraps the given
 * position.
 */
export function paragraphStart(
  position: vscode.Position,
  _inner: boolean,
  document = Context.current.document,
) {
  if (position.line > 0 && lineIsEmpty(position.line, document)) {
    position = Positions.lineStart(position.line - 1);  // Re-anchor to the previous line.
  }

  return toParagraphStart(position, document);
}

/**
 * Returns the end position of the paragraph that wraps given position.
 */
export function paragraphEnd(
  position: vscode.Position,
  inner: boolean,
  document = Context.current.document,
  start?: vscode.Position,
) {
  if (start !== undefined) {
    // It's much easier to check from start.
    position = start;
  }

  return toParagraphEnd(position, inner, document);
}

export declare namespace paragraph {
  export const start: typeof paragraphStart;
  export const end: typeof paragraphEnd;
}

Object.defineProperties(paragraph, {
  start: { value: paragraphStart },
  end: { value: paragraphEnd },
});

/**
 * Returns the range of the sentence that wraps the given position.
 */
export function sentence(
  position: vscode.Position,
  inner: boolean,
  document = Context.current.document,
) {
  const beforeBlank = toBeforeBlank(position, document, /* canSkipToPrevious= */ false),
        start = toSentenceStart(beforeBlank, document),
        end = sentenceEnd(start, inner, document);

  return new vscode.Selection(start, end);
}

/**
 * Returns the start position of the sentence that wraps the given position.
 */
export function sentenceStart(
  position: vscode.Position,
  _inner: boolean,
  document = Context.current.document,
) {
  // Special case to allow jumping to the previous sentence when position is
  // at current sentence start / leading blank chars.
  const beforeBlank = toBeforeBlank(position, document, /* canSkipToPrevious= */ true);

  return toSentenceStart(beforeBlank, document);
}

/**
 * Returns the end position of the sentence that wraps given position.
 */
export function sentenceEnd(
  position: vscode.Position,
  inner: boolean,
  document = Context.current.document,
  start?: vscode.Position,
) {
  if (start !== undefined) {
    // It is impossible to determine if active is at leading or trailing or
    // in-sentence blank characters by just looking ahead. Therefore, we
    // search from the sentence start, which may be slightly less efficient
    // but always accurate.
    position = start;
  }

  if (lineIsEmpty(position.line, document)) {
    // We're on an empty line which does not belong to last sentence or this
    // sentence. If next line is also empty, we should just stay here.
    // However, start scanning from the next line if it is not empty.
    if (position.line + 1 >= document.lineCount || lineIsEmpty(position.line + 1, document)) {
      return position;
    } else {
      position = Positions.lineStart(position.line + 1);
    }
  }

  const isBlank = getCharSetFunction(CharSet.Blank, document);

  let hadLf = false;
  const innerEnd = moveWhileByCharCodeForward(
    (charCode) => {
      if (charCode === CharCodes.LF) {
        if (hadLf) {
          return false;
        }

        hadLf = true;
      } else {
        hadLf = false;

        if (punctCharCodes.indexOf(charCode) >= 0) {
          return false;
        }
      }

      return true;
    },
    position,
    document,
  );

  if (moveWhileReachedDocumentEdge()) {
    return innerEnd;
  }

  // If a sentence ends with two LFs in a row, then the first LF is part of
  // the inner & outer sentence while the second LF should be excluded.
  if (hadLf) {
    if (inner) {
      return Positions.previous(innerEnd, document)!;
    }

    return innerEnd;
  }

  if (inner) {
    return innerEnd;
  }

  // If a sentence ends with punct char, then any blank characters after it
  // but BEFORE any line breaks belongs to the outer sentence.
  let col = innerEnd.character + 1;
  const text = document.lineAt(innerEnd.line).text;

  while (col < text.length && isBlank(text.charCodeAt(col))) {
    col++;
  }

  if (col >= text.length) {
    return Positions.lineBreak(innerEnd.line, document);
  }

  return new vscode.Position(innerEnd.line, col);
}

export declare namespace sentence {
  export const start: typeof sentenceStart;
  export const end: typeof sentenceEnd;
}

Object.defineProperties(sentence, {
  start: { value: sentenceStart },
  end: { value: sentenceEnd },
});

const punctCharCodes = new Uint32Array(Array.from(".!?¡§¶¿;՞。", (ch) => ch.charCodeAt(0)));
//                                                        ^
// I bet that's the first time you see a Greek question mark used as an actual
// Greek question mark, rather than as a "prank" semicolon.

function toArgumentEdge(
  from: vscode.Position,
  inner: boolean,
  direction: Direction,
  document: vscode.TextDocument,
) {
  const paren = direction === Direction.Backward ? CharCodes.LParen : CharCodes.RParen;

  let bbalance = 0,
      pbalance = 0;

  const afterSkip = moveWhileByCharCode(
    direction,
    (charCode) => {
      if (charCode === paren && pbalance === 0 && bbalance === 0) {
        return false;
      } else if (charCode === CharCodes.LParen) {
        pbalance++;
      } else if (charCode === CharCodes.LBracket) {
        bbalance++;
      } else if (charCode === CharCodes.RParen) {
        pbalance--;
      } else if (charCode === CharCodes.RBracket) {
        bbalance--;
      } else if (pbalance !== 0 || bbalance !== 0) {
        // Nop.
      } else if (charCode === CharCodes.Comma) {
        return false;
      }
      return true;
    },
    from,
    document,
  );

  let end: vscode.Position;

  if (moveWhileReachedDocumentEdge()) {
    end = afterSkip;
  } else {
    const charCode = document.lineAt(afterSkip.line).text.charCodeAt(afterSkip.character);
    // Make sure parens are not included in the object. Deliminator commas
    // after the argument is included as outer, but ones before are NOT.

    // TODO: Kakoune seems to have more sophisticated edge cases for commas,
    // e.g. outer last argument includes the comma before it, plus more edge
    // cases for who owns the whitespace. Those are not implemented for now
    // because they require extensive tests and mess a lot with the logic of
    // selecting the whole object.
    if (inner || charCode === paren || direction === Direction.Backward) {
      end = Positions.offset(afterSkip, -direction, document)!;
    } else {
      end = afterSkip;
    }
  }

  if (!inner) {
    return end;
  }

  const isBlank = getCharSetFunction(CharSet.Blank, document);

  // Exclude any surrounding whitespaces.
  return moveWhileByCharCode(-direction, isBlank, end, document);
}

function toIndentEdge(
  from: vscode.Position,
  inner: boolean,
  direction: Direction,
  document: vscode.TextDocument,
) {
  let line = from.line,
      textLine = document.lineAt(line);

  // First, scan backwards through blank lines. (Note that whitespace-only
  // lines do not count -- those have a proper indentation level and should
  // be treated as the inner part of the indent block.)
  while (textLine.text.length === 0) {
    line += direction;

    if (line < 0) {
      return Positions.zero;
    }

    if (line >= document.lineCount) {
      return Positions.last(document);
    }

    textLine = document.lineAt(line);
  }

  const indent = textLine.firstNonWhitespaceCharacterIndex;
  let lastNonBlankLine = line;

  for (;;) {
    line += direction;

    if (line < 0) {
      return Positions.zero;
    }

    if (line >= document.lineCount) {
      return Positions.last(document);
    }

    textLine = document.lineAt(line);

    if (textLine.text.length === 0) {
      continue;
    }

    if (textLine.firstNonWhitespaceCharacterIndex < indent) {
      const resultLine = inner ? lastNonBlankLine : line - direction;

      return direction === Direction.Backward
        ? Positions.lineStart(resultLine)
        : Positions.lineBreak(resultLine, document);
    }

    lastNonBlankLine = line;
  }
}

function toParagraphStart(
  position: vscode.Position,
  document: vscode.TextDocument,
) {
  let line = position.line;

  // Move past any trailing empty lines.
  while (line >= 0 && lineIsEmpty(line, document)) {
    line--;
  }

  if (line <= 0) {
    return Positions.zero;
  }

  // Then move to the start of the paragraph (non-empty lines).
  while (line > 0 && !lineIsEmpty(line - 1, document)) {
    line--;
  }

  return Positions.lineStart(line);
}

function toParagraphEnd(
  position: vscode.Position,
  inner: boolean,
  document: vscode.TextDocument,
) {
  let line = position.line;

  // Move to the end of the paragraph (non-empty lines)
  while (line < document.lineCount && !lineIsEmpty(line, document)) {
    line++;
  }

  if (line >= document.lineCount) {
    return Positions.last(document);
  }

  if (inner) {
    if (line > 0) {
      line--;
    }

    return Positions.lineBreak(line, document);
  }

  // Then move to the last trailing empty line.
  while (line + 1 < document.lineCount && lineIsEmpty(line + 1, document)) {
    line++;
  }

  return Positions.lineBreak(line, document);
}

function toBeforeBlank(
  position: vscode.Position,
  document: vscode.TextDocument,
  canSkipToPrevious: boolean,
) {
  const isBlank = getCharSetFunction(CharSet.Blank, document);

  let jumpedOverBlankLine = false,
      hadLf = true;

  const beforeBlank = moveWhileByCharCodeBackward(
    (charCode) => {
      if (charCode === CharCodes.LF) {
        if (hadLf) {
          jumpedOverBlankLine = true;

          return canSkipToPrevious;
        }

        hadLf = true;

        return true;
      } else {
        hadLf = false;

        return isBlank(charCode);
      }
    },
    position,
    document,
  );

  if (moveWhileReachedDocumentEdge()) {
    return position;
  }

  const beforeBlankChar = document.lineAt(beforeBlank.line).text.charCodeAt(beforeBlank.character),
        hitPunctChar = punctCharCodes.includes(beforeBlankChar);

  if (jumpedOverBlankLine && (!canSkipToPrevious || !hitPunctChar)) {
    // We jumped over blank lines but didn't hit a punct char. Don't accept.
    return position;
  }

  if (!hitPunctChar || canSkipToPrevious || position.line === beforeBlank.line) {
    return beforeBlank;
  }

  // Example below: we started from '|' and found the '.'.
  //     foo.
  //       |  bar
  // In this case, technically we started from the second sentence
  // and reached the first sentence. This is not permitted when when
  // allowSkipToPrevious is false, so let's go back.
  return position;
}

function toSentenceStart(
  position: vscode.Position,
  document: vscode.TextDocument,
) {
  const isBlank = getCharSetFunction(CharSet.Blank, document);
  let originLineText = document.lineAt(position.line).text;

  if (originLineText.length === 0 && position.line + 1 >= document.lineCount) {
    if (position.line === 0) {
      // There is only one line and that line is empty. What a life.
      return Positions.zero;
    }

    // Special case: If at the last line, search from the previous line.
    originLineText = document.lineAt(position.line - 1).text;
    position = new vscode.Position(position.line - 1, originLineText.length);
  }

  if (originLineText.length === 0) {
    // This line is empty. Just go to the first non-blank char on next line.
    const nextLineText = document.lineAt(position.line + 1).text;
    let col = 0;

    while (col < nextLineText.length && isBlank(nextLineText.charCodeAt(col))) {
      col++;
    }

    return new vscode.Position(position.line + 1, col);
  }

  let first = true,
      hadLf = false;

  const afterSkip = moveWhileByCharCodeBackward(
    (charCode) => {
      if (charCode === CharCodes.LF) {
        first = false;

        if (hadLf) {
          return false;
        }

        hadLf = true;
      } else {
        hadLf = false;

        if (first) {
          // Don't need to check if first character encountered is punct --
          // that may be the current sentence end.
          first = false;

          return true;
        }

        if (punctCharCodes.indexOf(charCode) >= 0) {
          return false;
        }
      }

      return true;
    },
    position,
    document,
  );

  // If we hit two LFs or document start, the current sentence starts at the
  // first non-blank character after that.
  if (hadLf || moveWhileReachedDocumentEdge()) {
    const start = moveWhileByCharCodeForward(isBlank, afterSkip, document);

    if (moveWhileReachedDocumentEdge()) {
      return Positions.zero;
    }

    return start;
  }

  // If we hit a punct char, then the current sentence starts on the first
  // non-blank character on the same line, or the line break.
  let col = afterSkip.character;
  const text = document.lineAt(afterSkip.line).text;

  while (col < text.length && isBlank(text.charCodeAt(col))) {
    col++;
  }

  return new vscode.Position(afterSkip.line, col);
}
