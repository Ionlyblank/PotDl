# PotDl

Open video links in PotPlayer with the right subtitles already loaded.

PotDl is a Chrome extension for Windows. Right-click a video link and choose **Open in PotPlayer**. PotDl works out
the show, season and episode, finds a matching subtitle on SubDL, and starts PotPlayer with it loaded. If it's the
wrong one, click the PotDl icon and pick another. The video keeps playing.

## What you need

- Windows with PotPlayer installed
- A free [SubDL API key](https://subdl.com/api-doc)
- The PotDl helper, a small program that lets Chrome talk to PotPlayer

## Helper

[Download PotDl-Setup.exe](https://github.com/Ionlyblank/PotDl/releases/latest/download/PotDl-Setup.exe) and open it.
It needs no admin rights and installs for the current user only. Because the file isn't code signed yet, Chrome or
Windows may warn about it. Choose Keep, then More info and Run anyway.

To remove it, uninstall **PotDl helper** from Installed apps in Windows Settings.

## Building

```powershell
.\helper\build.ps1   # creates dist\PotDl-Setup.exe with the C# compiler included in Windows
npm test             # runs the extension's logic tests
```

## Contact

Questions, problems or ideas: tripuzzle.app@gmail.com

PotDl is an independent project and isn't affiliated with PotPlayer or SubDL.
