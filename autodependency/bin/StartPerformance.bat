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
adb shell am broadcast -a com.tuniu.startservice