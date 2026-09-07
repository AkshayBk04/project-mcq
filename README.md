# PROJECT MCQ v1.0

A static, mobile-friendly quiz website built from the uploaded book:

**An Introduction to Educational Technology — Prasanth Venpakal**

## Included
- 1,060 MCQs
- 8 section filters
- Study Mode with instant feedback
- Exam Mode with end-of-test scoring
- 10 / 25 / 50 / 100 / all-question quizzes
- Random question order
- Random answer-option order
- Source-page links back to the included PDF
- Question navigator
- Mark for Review
- Bookmarks
- Answer review
- Browser-saved attempt history, best score and bookmarks
- Light / dark theme
- Responsive mobile layout

## Run it locally
Just open `index.html` in Chrome, Edge, Firefox or Safari.

The question bank is loaded from a JavaScript data file so it also works when opened directly from your computer without a local web server.

## Put it on GitHub Pages
1. Create a new GitHub repository, for example `project-mcq`.
2. Upload **all files and folders from this package** to the repository root.
3. In GitHub, open **Settings → Pages**.
4. Under **Build and deployment**, choose:
   - Source: **Deploy from a branch**
   - Branch: **main**
   - Folder: **/(root)**
5. Save.
6. After GitHub finishes deploying, the site will be available at:
   `https://YOUR-USERNAME.github.io/project-mcq/`

## Adding another book later
The site is designed so the question bank can be expanded without rebuilding the basic quiz engine.

Current data files:
- `data/educational-technology.js` — used by the website
- `data/educational-technology.json` — clean structured copy for future processing

## Folder structure
```
PROJECT_MCQ_v1/
├── index.html
├── styles.css
├── app.js
├── README.md
├── .nojekyll
├── assets/
│   └── AN_INTRODUCTION_TO_EDUCATIONAL_TECHNOLOG.pdf
└── data/
    ├── educational-technology.js
    └── educational-technology.json
```
