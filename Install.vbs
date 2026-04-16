Set WshShell = CreateObject("WScript.Shell")
WshShell.CurrentDirectory = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
WshShell.Run "python -m skillcat", 0, True
MsgBox "SkillCat installed successfully!", vbInformation, "Installation Complete"
