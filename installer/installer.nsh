; Extra steps for the Retrace installer (electron-builder includes this file).
; The finish page offers to start Retrace and, unticked by default, to add a
; desktop shortcut. The Start menu entry is always created.

!macro customFinishPage
  !define MUI_FINISHPAGE_RUN "$INSTDIR\Retrace.exe"
  !define MUI_FINISHPAGE_RUN_TEXT "Start Retrace"
  !define MUI_FINISHPAGE_SHOWREADME ""
  !define MUI_FINISHPAGE_SHOWREADME_TEXT "Create a desktop shortcut"
  !define MUI_FINISHPAGE_SHOWREADME_NOTCHECKED
  !define MUI_FINISHPAGE_SHOWREADME_FUNCTION RetraceDesktopShortcut
  !insertmacro MUI_PAGE_FINISH
!macroend

!ifndef BUILD_UNINSTALLER
Function RetraceDesktopShortcut
  CreateShortCut "$DESKTOP\Retrace.lnk" "$INSTDIR\Retrace.exe"
FunctionEnd
!endif

!macro customUnInstall
  Delete "$DESKTOP\Retrace.lnk"
!macroend
