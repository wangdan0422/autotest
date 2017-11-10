cd  %1
%2
taskkill /F /IM TAP.exe
java -jar ./plugins/autopack.jar %1
pause
exit