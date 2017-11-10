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
adb install -r %pard%\mobile\appium\build\performance\performance.apk
adb shell am start -n org.tn.qa.automation/.service.MainPageActivity