You are building a songsterr like clone for playing guitar tabs.
https://www.songsterr.com/
Empty repocreated here https://github.com/pacificnm/tab-king

code folder: /home/jaimie/projects/tab-king

Stack Electron, SQLight,Tailwind, React
Single User

We do not want the native window decoration
Custom window decrotion should habe a Hamburger Menu Icon that launches a left flyout menu
File -> prefernces, backup/restore
Help -> Contents, About

The Main Menu should have a Search, Play List, Favorites, Artist as top level menus.
Artist Will open up to Albums then songs. Each Menu item should have a right click menu to Add, edit or play.

Songs will have a GP guitar pro file,Midi and MP3.We need to be able to sync the MP3 track to the gp played file so everything is in sync

Database will get song info from ID3 tags, This will assit with searching and album art

The main screen has the player with a static footer that contains Play, forward, back controls. We also need a click metramone that canbe tunred off, a 3 click counter that can beturned off. Need a Select and Loop to play mesures and sectionsina loop. Speed controls when playing midi.

Some GPfiles will have multiple instuments we want to be able to play each midi seperatly, Also attach a MP3 for each instrument. So there needs to be a master MP3 then mp3 per instrament.

Prefernces should include themes,file/folder locations
About should be a modal with version number and a check to github for updated release
Help should open a Right side flyout with a table of contents.

Create the README, CLAUD, specs and requirements md docs before writing any code.
