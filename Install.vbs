Set WshShell = CreateObject("WScript.Shell")
WshShell.CurrentDirectory = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
WshShell.Run "python setup.py install", 0, True
MsgBox "SkillPointer installed successfully!", vbInformation, "Installation Complete"
