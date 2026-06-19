$ErrorActionPreference = 'Stop'

Add-Type @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;

public static class WeChatWindow {
  private delegate bool EnumWindowsProc(IntPtr window, IntPtr parameter);

  [StructLayout(LayoutKind.Sequential)]
  private struct Rect { public int Left, Top, Right, Bottom; }

  [DllImport("user32.dll")]
  private static extern bool EnumWindows(EnumWindowsProc callback, IntPtr parameter);

  [DllImport("user32.dll")]
  private static extern uint GetWindowThreadProcessId(IntPtr window, out uint processId);

  [DllImport("user32.dll", CharSet = CharSet.Unicode)]
  private static extern int GetClassName(IntPtr window, StringBuilder className, int count);

  [DllImport("user32.dll")]
  private static extern bool GetWindowRect(IntPtr window, out Rect rect);

  [DllImport("user32.dll")]
  public static extern bool ShowWindowAsync(IntPtr window, int command);

  [DllImport("user32.dll")]
  public static extern bool SetForegroundWindow(IntPtr window);

  [DllImport("user32.dll")]
  public static extern bool IsWindowVisible(IntPtr window);

  public static IntPtr FindMainWindow(uint[] processIds) {
    var roots = new HashSet<uint>(processIds);
    var bestWindow = IntPtr.Zero;
    long bestArea = 0;

    EnumWindows((window, parameter) => {
      uint processId;
      GetWindowThreadProcessId(window, out processId);
      if (!roots.Contains(processId)) return true;

      var className = new StringBuilder(256);
      GetClassName(window, className, className.Capacity);
      var name = className.ToString();
      if (!name.StartsWith("Qt", StringComparison.Ordinal) || name.IndexOf("Tray", StringComparison.OrdinalIgnoreCase) >= 0) return true;
      Rect rect;
      if (!GetWindowRect(window, out rect)) return true;

      var area = Math.Max(0, rect.Right - rect.Left) * (long)Math.Max(0, rect.Bottom - rect.Top);
      if (area > bestArea) {
        bestArea = area;
        bestWindow = window;
      }
      return true;
    }, IntPtr.Zero);

    return bestWindow;
  }
}
'@

$processes = @(Get-CimInstance Win32_Process | Where-Object { $_.Name -in @('WeChat.exe', 'Weixin.exe') })
$processIds = @($processes.ProcessId)
$roots = @($processes | Where-Object { $processIds -notcontains $_.ParentProcessId })

if ($roots.Count -eq 0) {
  Write-Output 'NOT_FOUND'
  exit 0
}

$window = [WeChatWindow]::FindMainWindow([uint32[]]@($roots.ProcessId))
if ($window -eq [IntPtr]::Zero) {
  Write-Output 'WINDOW_NOT_FOUND'
  exit 0
}

[WeChatWindow]::ShowWindowAsync($window, 9) | Out-Null
Start-Sleep -Milliseconds 200
[WeChatWindow]::SetForegroundWindow($window) | Out-Null

if ([WeChatWindow]::IsWindowVisible($window)) {
  Write-Output 'ACTIVATED'
} else {
  Write-Output 'RESTORE_FAILED'
}
