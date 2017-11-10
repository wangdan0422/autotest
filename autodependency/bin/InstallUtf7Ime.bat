@echo off
echo %~dp0
echo %~f0
pushd "%~dp0"
cd ..
set pard=%cd%
popd
%~d0
cd %pard%\mobile\android\adb
echo %cd%
adb install %pard%\mobile\appium\build\Utf7Ime_apk\Utf7Ime.apk
pause