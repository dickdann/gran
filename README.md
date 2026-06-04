# A Life Remembered

A small memorial photo site for sharing a curated slideshow of photographs, with a simple admin page for ordering and hiding images.

## Purpose

This project lets you:
- display a polished memorial slideshow on the public site,
- upload and manage photos from an admin area,
- choose a hero image and control slideshow timing/transitions.

## Features

- Public home page with a hero photo and slideshow launch button
- Admin password-protected area for managing photos
- Drag-and-drop photo uploads
- Photo ordering, hero selection, transition, duration, and hide settings
- Thumbnail preview that opens a larger modal image

## Tech stack

- Node.js + HTTP server
- Plain HTML/CSS/JavaScript
- Formidable for image uploads
- dotenv for environment configuration

## Run locally

1. Install dependencies:
   npm install
2. Start the server:
   npm start
3. Open the site in your browser:
   http://localhost:3000

You can also launch the browser automatically with:

npm run open

## Cache busting

The server appends the value from `cache-version.txt` to local CSS and JavaScript files in served HTML, for example `styles.css?v=2026.06.05`.

After changing `styles.css`, `app.js`, `admin.js`, or `player.js` in production, update `cache-version.txt` to a new value and restart/redeploy the server so browsers fetch the new files.

## Environment

The server uses these environment variables when present:

- PORT — custom port for the server (default: 3000)
- PASSWORD — admin password (default: morag79)

## Project structure

- index.html — public home page
- play.html / player.js — slideshow viewer
- admin.html / admin.js — photo management interface
- server.js — HTTP server, API routes, and image handling
- assets/ — uploaded images
- data/config.json — saved slideshow configuration
- cache-version.txt — cache-busting version for CSS and JavaScript
