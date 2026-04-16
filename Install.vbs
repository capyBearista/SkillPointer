Set WshShell = CreateObject("WScript.Shell")
WshShell.CurrentDirectory = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
exitCode = WshShell.Run("npx --yes skillcat", 1, True)
If exitCode = 0 Then
  MsgBox "SkillCat finished successfully!", vbInformation, "SkillCat"
Else
  MsgBox "SkillCat failed with exit code " & exitCode & ".", vbExclamation, "SkillCat"
End If
