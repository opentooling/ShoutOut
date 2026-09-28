# ShoutOut brand

Warm, friendly and a little playful. The living style guide is at **`/brand`**
(public, no sign-in needed), e.g. http://shoutout.localtest.me/brand.

## Logo

- Megaphone mark with a heart: recognition, said out loud.
- Wordmark set in Fredoka SemiBold, converted to outlines
  (`src/components/brand/wordmark-paths.ts`), so it never depends on font loading.
- Files: `public/brand/logo.svg`, `logo-on-dark.svg`, `logo-mark.svg`.
- App icons: `src/app/icon.svg`, `favicon.ico` (16/32/48, simplified teal tile), `apple-icon.png`.
- In React use `<Logo />` or `<Logo variant="mark" />`; it follows light/dark mode.

## Colour

Tokens live in `src/app/globals.css` and are exposed as Tailwind colours
(`bg-sunny`, `text-teal-strong`, `bg-coral-soft`, ...). Each hue has a base,
`-strong` (text/emphasis) and `-soft` (backgrounds) shade, redefined for dark mode.

| Hue                     | Use                                           |
| ----------------------- | --------------------------------------------- |
| Sunny                   | Primary actions, highlights                   |
| Teal                    | Brand secondary, links, "Out" in the wordmark |
| Coral, Lilac, Sky, Leaf | Card tones, avatars, illustrations            |

Neutrals: `background`, `surface`, `surface-muted`, `border`, `muted`, `foreground`.

## Type

- **Fredoka** (`font-display`) for headings and card titles.
- **Nunito** (`font-sans`) for body text.

## Theme

Light, dark or match system. Dark mode is a soft navy (background `#1a2336`,
cards `#222d44`, text `#e9edf5`) rather than near-black, with every text pair at
WCAG AA or better. The choice is stored in the `shoutout-theme`
cookie and rendered on the server (`<html data-theme>`), so there is no flash.
Tailwind's `dark:` variant follows the same rules.

## Cards

Ten illustrated defaults (`src/components/cards/designs.ts`), each an
illustration plus a tone. Admins will be able to create more cards from the
same illustrations and tones.

| Card           | Illustration | Tone  |
| -------------- | ------------ | ----- |
| Thank You      | heart        | coral |
| Above & Beyond | rocket       | lilac |
| Team Player    | buddies      | teal  |
| Great Idea     | lightbulb    | sunny |
| Welcome Aboard | sailboat     | sky   |
| Congrats       | party-popper | leaf  |
| Customer Hero  | shield       | coral |
| Problem Solver | puzzle       | lilac |
| Mentor         | sprout       | teal  |
| Crushed It     | trophy       | sunny |
