$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes

$wechatChineseName = ([char]0x5FAE).ToString() + ([char]0x4FE1).ToString()
$hiddenIconsChineseName = ([char]0x663E).ToString() + ([char]0x793A).ToString() + ([char]0x9690).ToString() + ([char]0x85CF).ToString() + ([char]0x7684).ToString() + ([char]0x56FE).ToString() + ([char]0x6807).ToString()

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
  private static extern bool IsWindowVisible(IntPtr window);

  [DllImport("user32.dll")]
  public static extern bool SetForegroundWindow(IntPtr window);

  [DllImport("user32.dll", CharSet = CharSet.Unicode)]
  public static extern IntPtr FindWindow(string className, string windowName);

  public static IntPtr FindVisibleMainWindow(uint[] processIds) {
    var roots = new HashSet<uint>(processIds);
    var bestWindow = IntPtr.Zero;
    long bestArea = 0;

    EnumWindows((window, parameter) => {
      uint processId;
      GetWindowThreadProcessId(window, out processId);
      if (!roots.Contains(processId) || !IsWindowVisible(window)) return true;

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

function Find-WeChatTrayIcon {
  param([System.Windows.Automation.AutomationElement]$Container)

  if ($null -eq $Container) { return $null }
  $items = $Container.FindAll(
    [System.Windows.Automation.TreeScope]::Descendants,
    [System.Windows.Automation.Condition]::TrueCondition
  )
  for ($index = 0; $index -lt $items.Count; $index++) {
    $item = $items.Item($index)
    $isWeChat = $item.Current.Name -match 'WeChat|Weixin' -or $item.Current.Name.Contains($wechatChineseName)
    if ($item.Current.ClassName -eq 'SystemTray.NormalButton' -and $isWeChat) {
      return $item
    }
  }
  return $null
}

function Get-WeChatTrayIcon {
  $taskbarHandle = [WeChatWindow]::FindWindow('Shell_TrayWnd', $null)
  $taskbar = [System.Windows.Automation.AutomationElement]::FromHandle($taskbarHandle)
  $icon = Find-WeChatTrayIcon $taskbar
  if ($null -ne $icon) { return $icon }

  $items = $taskbar.FindAll(
    [System.Windows.Automation.TreeScope]::Descendants,
    [System.Windows.Automation.Condition]::TrueCondition
  )
  for ($index = 0; $index -lt $items.Count; $index++) {
    $item = $items.Item($index)
    if ($item.Current.Name -eq $hiddenIconsChineseName -or $item.Current.Name -match 'Show hidden icons') {
      $invoke = [System.Windows.Automation.InvokePattern]$item.GetCurrentPattern(
        [System.Windows.Automation.InvokePattern]::Pattern
      )
      $invoke.Invoke()
      Start-Sleep -Milliseconds 250
      break
    }
  }

  $overflowHandle = [WeChatWindow]::FindWindow('NotifyIconOverflowWindow', $null)
  if ($overflowHandle -eq [IntPtr]::Zero) { return $null }
  $overflow = [System.Windows.Automation.AutomationElement]::FromHandle($overflowHandle)
  return Find-WeChatTrayIcon $overflow
}

function Invoke-WeChatTrayIcon {
  $icon = Get-WeChatTrayIcon
  if ($null -eq $icon) { return $false }
  $invoke = [System.Windows.Automation.InvokePattern]$icon.GetCurrentPattern(
    [System.Windows.Automation.InvokePattern]::Pattern
  )
  $invoke.Invoke()
  return $true
}

$processes = @(Get-CimInstance Win32_Process | Where-Object { $_.Name -in @('WeChat.exe', 'Weixin.exe') })
$processIds = @($processes.ProcessId)
$roots = @($processes | Where-Object { $processIds -notcontains $_.ParentProcessId })

if ($roots.Count -eq 0) {
  Write-Output 'NOT_FOUND'
  exit 0
}

$rootIds = [uint32[]]@($roots.ProcessId)
$wasVisible = [WeChatWindow]::FindVisibleMainWindow($rootIds) -ne [IntPtr]::Zero

if (-not (Invoke-WeChatTrayIcon)) {
  Write-Output 'TRAY_ICON_NOT_FOUND'
  exit 0
}

Start-Sleep -Milliseconds 400
if ($wasVisible) {
  if (-not (Invoke-WeChatTrayIcon)) {
    Write-Output 'TRAY_ICON_NOT_FOUND'
    exit 0
  }
  Start-Sleep -Milliseconds 500
}

$window = [IntPtr]::Zero
for ($attempt = 0; $attempt -lt 10; $attempt++) {
  $window = [WeChatWindow]::FindVisibleMainWindow($rootIds)
  if ($window -ne [IntPtr]::Zero) { break }
  Start-Sleep -Milliseconds 200
}

if ($window -eq [IntPtr]::Zero) {
  Write-Output 'RESTORE_FAILED'
  exit 0
}

[WeChatWindow]::SetForegroundWindow($window) | Out-Null
$shell = New-Object -ComObject WScript.Shell
$shell.AppActivate([int]$roots[0].ProcessId) | Out-Null
Write-Output 'ACTIVATED'
