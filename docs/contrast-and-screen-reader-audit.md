# Contrast and screen-reader audit

RecallFlow uses native landmarks, headings, lists, description lists, form
controls, live statuses, alerts, and progress elements. Icons are decorative
and hidden from assistive technology; their adjacent text supplies every
control name and state.

## Contrast results

Rendered colors were checked against WCAG AA thresholds: 4.5:1 for normal
text, 3:1 for large text, and 3:1 for control boundaries.

| Pair | Ratio | Threshold |
| --- | ---: | ---: |
| Muted text `#9aa8a2` on background `#080b0a` | 8.00:1 | 4.5:1 |
| Muted text `#9aa8a2` on surface `#111614` | 7.40:1 | 4.5:1 |
| Accent text `#34d399` on background `#080b0a` | 10.28:1 | 4.5:1 |
| Error text `#fda4af` on background `#080b0a` | 10.45:1 | 4.5:1 |
| Control border `#5f6f68` on background `#080b0a` | 3.73:1 | 3:1 |
| Control border `#5f6f68` on surface `#111614` | 3.45:1 | 3:1 |
| Destructive border at 65% on surface `#111614` | 3.51:1 | 3:1 |

Placeholder text uses the muted text color. Correct and incorrect states never
depend on color alone: they also include visible result text and native control
state.

## Screen-reader review

Run `npm run desktop:dev`, then review with VoiceOver, Narrator, or Orca:

1. Navigate by landmarks and headings. Confirm the banner, main navigation,
   main region, page heading, and named content regions are announced once.
2. On **Add quiz**, confirm the quiz-source buttons are announced as one named
   group and expose their pressed state.
3. Confirm every field announces its label and supporting description, and
   invalid import or generation messages are announced as alerts.
4. Focus each scrollable code preview and confirm its heading is used as the
   accessible name.
5. Complete a quiz and confirm answer options expose checkbox or radio state,
   feedback is announced as a status, and progress has a useful label/value.
6. On results and history, navigate by description list to confirm each metric
   label stays associated with its value. Correct and incorrect review items
   must announce their textual state.
7. Trigger copy, save, and provider failures. Confirm status updates are polite,
   errors are assertive, and no API key or imported content is announced beyond
   the active form or result.

Run `npm run check` after the manual review for the complete frontend and Rust
validation suite.
