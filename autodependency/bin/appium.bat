@echo off
echo %~dp0
echo %~f0
pushd "%~dp0"
cd ..
set pard=%cd%
popd
%~d0
cd %pard%\mobile\appium
echo %cd%
node .
pause