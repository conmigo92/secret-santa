# Secret Santa

A static page for drawing Secret Santa names. The organizer adds participants, marks pairs who must not draw each other (couples, and anyone else), and can add a budget and an exchange note. Each person gets a private link that shows only who they are buying for.

There is no server and no account. The match is stored in the link's URL fragment, lightly obfuscated so it is not plain text. One link does not include anyone else's match. Opening it only needs the page itself, so the built site can be hosted on GitHub Pages.

## White Elephant

Open White Elephant from the games nav. Add the players on one shared screen. The page shuffles a turn order. On a turn, open a gift and type what it was, or steal an opened gift. The person who lost the gift goes next and cannot take that same gift straight back. A gift locks after three steals. You can change that limit. Player 1 can take a final swap, and you can turn that rule off. The game stays in this browser until you start a new one.

## Run

```bash
npm install
npm test
npm run dev
```

`npm run build` typechecks and writes the static site to `dist/`. `npm run preview` serves that build. The app is mounted at `/secret-santa/`, so the local address includes that path.

## GitHub Pages

Pushes to `main` build and deploy to [https://conmigo92.github.io/secret-santa/](https://conmigo92.github.io/secret-santa/). In the repository settings, GitHub Pages has to use the **GitHub Actions** source before that workflow can publish.

Vite's base is `/secret-santa/`. A private link copied from the deployed site is an absolute URL on that host, with the match in the fragment (`https://conmigo92.github.io/secret-santa/#…`). Drawing again creates new links; a link you already sent still opens the previous match.
