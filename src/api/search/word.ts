import * as vscode from "vscode";

import { skipEmptyLines, skipEmptyLinesReachedDocumentEdge } from "./move";
import { Context } from "../context";
import { Direction, SelectionBehavior } from "../types";
import { CharSet, getCharSetFunction } from "../../utils/charset";

const enum WordCategory {
  Word,
  Blank,
  Punctuation,
}

function categorize(
  charCode: number,
  isBlank: (charCode: number) => boolean,
  isWord: (charCode: number) => boolean,
) {
  return isWord(charCode)
    ? WordCategory.Word
    : charCode === 0 || isBlank(charCode) ? WordCategory.Blank : WordCategory.Punctuation;
}

/**
 * Starting at the given `origin` position, seeks the next (or previous) word.
 * Returns a selection wrapping the next word.
 */
export function wordBoundary(
  direction: Direction,
  origin: vscode.Position,
  stopAtEnd: boolean,
  wordCharset: CharSet,
  context = Context.current,
) {
  let anchor: vscode.Position | undefined = undefined,
      active = origin;

  const document = context.document,
        text = document.lineAt(active.line).text,
        lineEndCol = context.selectionBehavior === SelectionBehavior.Caret
          ? text.length
          : text.length - 1;

  const isWord = getCharSetFunction(wordCharset, document),
        isBlank = getCharSetFunction(CharSet.Blank, document),
        isPunctuation = getCharSetFunction(CharSet.Punctuation, document);

  // Starting from active, try to seek to the word start.
  const isAtLineBoundary = direction === Direction.Forward
    ? (active.character >= lineEndCol)
    : (active.character === 0 || active.character === 1);

  if (isAtLineBoundary) {
    const afterEmptyLines = skipEmptyLines(direction, active.line + direction, document);

    if (skipEmptyLinesReachedDocumentEdge()) {
      return undefined;
    }

    anchor = afterEmptyLines;
  } else {
    let shouldSkip: boolean;

    if (context.selectionBehavior === SelectionBehavior.Character) {
      // Skip current character if it is at boundary.
      // (e.g. "ab[c]  " =>`w`)
      const col = active.character - +(direction === Direction.Backward),
            characterCategory = categorize(text.charCodeAt(col), isBlank, isWord),
            nextCharacterCategory = categorize(text.charCodeAt(col + direction), isBlank, isWord);

      shouldSkip = characterCategory !== nextCharacterCategory;

      if (shouldSkip && stopAtEnd === (direction === Direction.Forward)
          && (characterCategory === WordCategory.Blank)) {
        shouldSkip = false;
      }
    } else {
      shouldSkip = false;
    }

    anchor = shouldSkip ? new vscode.Position(active.line, active.character + direction) : active;
  }

  active = anchor;

  // Scan within the current line until the word ends.
  const curLineText = document.lineAt(active).text;
  let nextCol = active.character;  // The next character to be tested.

  if (direction === Direction.Backward) {
    nextCol--;
  }

  if (stopAtEnd === (direction === Direction.Forward)) {
    // Select the whitespace before word, if any.
    while (nextCol >= 0 && nextCol < curLineText.length
           && isBlank(curLineText.charCodeAt(nextCol))) {
      nextCol += direction;
    }
  }

  if (nextCol >= 0 && nextCol < curLineText.length) {
    const startCharCode = curLineText.charCodeAt(nextCol),
          isSameCategory = isWord(startCharCode) ? isWord : isPunctuation;

    while (nextCol >= 0 && nextCol < curLineText.length
           && isSameCategory(curLineText.charCodeAt(nextCol))) {
      nextCol += direction;
    }
  }

  if (stopAtEnd === (direction === Direction.Backward)) {
    // Select the whitespace after word, if any.
    while (nextCol >= 0 && nextCol < curLineText.length
           && isBlank(curLineText.charCodeAt(nextCol))) {
      nextCol += direction;
    }
  }

  if (direction === Direction.Backward) {
    // If we reach here, nextCol must be the first character we encounter
    // that does not belong to the current word (or -1 / line break).
    // Exclude it.
    active = new vscode.Position(active.line, nextCol + 1);
  } else {
    active = new vscode.Position(active.line, nextCol);
  }

  return new vscode.Selection(anchor, active);
}
