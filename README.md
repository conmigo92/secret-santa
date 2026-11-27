# Secret Santa

A static page for drawing Secret Santa names. The organizer adds participants, marks pairs who must not draw each other (couples, and anyone else), and can add a budget and an exchange note. Each person gets a private link that shows only who they are buying for.

There is no server and no account. The match is stored in the link's URL fragment, lightly obfuscated so it is not plain text. One link does not include anyone else's match. Opening it only needs the page itself, so the built site can be hosted on GitHub Pages.

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
