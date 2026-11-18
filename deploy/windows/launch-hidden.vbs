Option Explicit

' A GUI host prevents an interactive scheduled task from creating a visible
' console before PowerShell can apply -WindowStyle Hidden. Wait for PowerShell
' so Task Scheduler still owns the complete lifetime and receives its exit code.
Dim role, shell, files, launcher, powershell, command, result
If WScript.Arguments.Count <> 1 Then WScript.Quit 64
role = LCase(WScript.Arguments(0))
If role <> "bridge" And role <> "tunnel" Then WScript.Quit 64

Set shell = CreateObject("WScript.Shell")
Set files = CreateObject("Scripting.FileSystemObject")
launcher = files.BuildPath(files.GetParentFolderName(WScript.ScriptFullName), "launch.ps1")
powershell = shell.ExpandEnvironmentStrings("%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe")
command = Quote(powershell) & " -NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File " & Quote(launcher) & " -Role " & role
On Error Resume Next
result = shell.Run(command, 0, True)
If Err.Number <> 0 Then WScript.Quit 1
On Error GoTo 0
WScript.Quit result

Function Quote(value)
  Quote = Chr(34) & value & Chr(34)
End Function
