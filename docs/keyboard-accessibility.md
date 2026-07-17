# Keyboard navigation and focus audit

RecallFlow uses native buttons, links, form controls, radio groups, checkboxes,
and disclosure widgets so platform keyboard behavior remains available without
custom shortcuts. View changes move focus to the new page heading, question
changes move focus to the new question, and checking an answer moves focus to
the result message before the next controls.

## Keyboard-only review

Run the desktop app with `npm run desktop:dev`, then complete this review
without using a pointer:

1. Press Tab from the top of the app. The **Skip to main content** link becomes
   visible, and Enter moves focus to the main region.
2. Tab through the header. Each navigation button has a visible focus ring and
   Enter or Space opens its view. The new view heading receives focus.
3. On **Add quiz**, reach the file picker, source buttons, fields, selects,
   generated-question disclosures, copy buttons, and scrollable JSON previews.
   Every interactive or scrollable target has a visible focus indicator.
4. Start a quiz. The quiz title receives focus. Use arrow keys to move within a
   single-choice or true/false radio group, and Space to toggle multiple-choice
   checkboxes.
5. Choose an answer and activate **Check answer**. Focus moves to the correct or
   incorrect result message instead of being lost when the button is disabled.
   Tab continues into the explanation, mnemonic controls when present, and the
   next-question action.
6. Activate **Next question**. Focus moves to the new question heading. Finish
   the quiz and confirm that the summary heading receives focus.
7. Activate **Study again**, **Repair missed answers**, **Back to library**, and
   **Back to library** from an active quiz. Each replacement view receives a
   logical heading focus target.
8. Trigger an invalid import or generation request. The alert is announced and
   the retry or editable form controls remain reachable in document order.

Run `npm run check` after the manual review for the complete frontend and Rust
validation suite.
