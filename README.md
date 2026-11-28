# Xmas Game Box

A static site for Christmas party games. The home page is a box of games. Each game is one entry in `src/nav-entries/`, and that entry supplies the nav label, the card, and the how-to link.

Secret Santa is one of the games. The organizer adds participants, marks pairs who must not draw each other (couples, and anyone else), and can add a budget and an exchange note. Each person gets a private link that shows only who they are buying for.

There is no server and no account. The match is stored in the link's URL fragment, lightly obfuscated so it is not plain text. One link does not include anyone else's match. Opening it only needs the page itself, so the built site can be hosted on GitHub Pages.

## White Elephant

Open White Elephant from the home page or the games nav. Add the players on one shared screen, then set the steal limit, the steal-back switch, and whether player 1 gets a final swap. The page shuffles a turn order. On a turn, open a gift and type what it was, or steal an opened gift. A steal limit of 0 means no stealing. Otherwise a gift locks after that many steals. With the steal-back switch on, the person who lost a gift cannot take that same gift straight back. Those rules stay on screen during the game. The game stays in this browser until you start a new one.

## Run

```bash
npm install
npm test
npm run dev
```

`npm run build` typechecks and writes the static site to `dist/`. `npm run preview` serves that build. The app is mounted at `/secret-santa/`, so the local address includes that path.

## GitHub Pages

Pushes to `main` build and deploy to [https://conmigo92.github.io/secret-santa/](https://conmigo92.github.io/secret-santa/). In the repository settings, GitHub Pages has to use the **GitHub Actions** source before that workflow can publish.

Vite's base is `/secret-santa/`. A private link copied from the deployed site is an absolute URL on that host, with the match in the fragment (`https://conmigo92.github.io/secret-santa/#…`). Opening that address still shows the reveal. The home page sends any non-empty fragment to the Secret Santa page and keeps the fragment. Drawing again creates new links; a link you already sent still opens the previous match.

## Dirty Santa

Open Dirty Santa from the home page or the games nav. Enter names in seat order. Left is the next name, and the last seat's left is the first name. Set the timer in minutes, choose 1 or 2 rounds, and set what each die face does. Reset faces puts the die back to the usual actions. Everyone starts with a wrapped gift. Roll the on-screen die. A countdown ends the round, and you can pause it. The timer, the round count, and the faces stay on screen during the game. The game stays in this browser until you start a new one.

## Christmas Trivia

Open Christmas Trivia from the home page or the games nav. Add players or teams. Set the seconds for each question, and set how many questions to play. The host can add custom questions before the game. Those questions are always included, so the count has to cover them. The page shows a multiple-choice question. Show the answer, give the point to one player or to nobody, then go on. A timer of 0 waits for the host. The scores stay in this browser until you start a new game.

## Charades

Open Charades from the home page or the games nav. Add two or more teams. Pick charades or pictionary, pick easy, medium, hard, or a mix, and set the seconds. The actor taps Show word. The guessers should be looking away. Got it scores a point and passes to the next team. Skip deals a new word to the same team. The scores stay in this browser until you start a new game.

## Ugly Sweater

Open Ugly Sweater from the home page or the games nav. The host adds the contestants. Pass the phone. Each person votes once, in three categories, and cannot vote for themselves. The ballots stay hidden. When everyone has voted, the host reveals the winners. A tie lists every name. The contest stays in this browser until you start a new one.

## Holiday Bingo

Open Holiday Bingo from the home page or the games nav. The host makes one card per player. Each card is a link with the card seed in the fragment, and the center square is free. A player opens that link, taps a square when it happens, and the page calls bingo on a full line. The same link always opens the same card. Marks stay in that browser.
