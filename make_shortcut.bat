@echo off
rem Creates a desktop shortcut called "Anime Assistant" with the slime heart icon.
rem Double-click this once. After that, start the app from the desktop shortcut.
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$s = (New-Object -ComObject WScript.Shell).CreateShortcut([Environment]::GetFolderPath('Desktop') + '\Anime Assistant.lnk');" ^
  "$s.TargetPath = '%~dp0start.bat';" ^
  "$s.WorkingDirectory = '%~dp0';" ^
  "$s.IconLocation = '%~dp0frontend\assets\icon.ico';" ^
  "$s.Description = 'Anime Assistant';" ^
  "$s.Save()"
echo Done! Look for "Anime Assistant" on your desktop.
pause
