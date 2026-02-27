Add-Type -AssemblyName System.Windows.Forms
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;

[ComImport, Guid("DC1C5A9C-E88A-4DDE-A5A1-60F82A20AEF7")]
internal class FileOpenDialogRCW {}

[ComImport, Guid("43826D1E-E718-42EE-BC55-A1E261C37BFE")]
[InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
public interface IShellItem {
    void BindToHandler(IntPtr pbc, ref Guid bhid, ref Guid riid, out IntPtr ppv);
    void GetParent(out IShellItem ppsi);
    void GetDisplayName(uint sigdnName, [MarshalAs(UnmanagedType.LPWStr)] out string ppszName);
    void GetAttributes(uint sfgaoMask, out uint psfgaoAttribs);
    int Compare(IShellItem psi, uint hint);
}

[ComImport, Guid("42F85136-DB7E-439C-85F1-E4075D135FC8")]
[InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
internal interface IFileOpenDialog {
    [PreserveSig] int Show(IntPtr hwndOwner);
    void SetFileTypes(uint cFileTypes, IntPtr rgFilterSpec);
    void SetFileTypeIndex(uint iFileType);
    void GetFileTypeIndex(out uint piFileType);
    void Advise(IntPtr pfde, out uint pdwCookie);
    void Unadvise(uint dwCookie);
    void SetOptions(uint fos);
    void GetOptions(out uint pfos);
    void SetDefaultFolder(IShellItem psi);
    void SetFolder(IShellItem psi);
    IShellItem GetFolder();
    IShellItem GetCurrentSelection();
    void SetFileName([MarshalAs(UnmanagedType.LPWStr)] string pszName);
    [return: MarshalAs(UnmanagedType.LPWStr)] string GetFileName();
    void SetTitle([MarshalAs(UnmanagedType.LPWStr)] string pszTitle);
    void SetOkButtonLabel([MarshalAs(UnmanagedType.LPWStr)] string pszText);
    void SetFileNameLabel([MarshalAs(UnmanagedType.LPWStr)] string pszLabel);
    IShellItem GetResult();
    void AddPlace(IShellItem psi, int fdap);
    void SetDefaultExtension([MarshalAs(UnmanagedType.LPWStr)] string pszDefaultExtension);
    void Close(int hr);
    void SetClientGuid(ref Guid guid);
    void ClearClientData();
    void SetFilter(IntPtr pFilter);
    void GetResults(out IntPtr ppenum);
    void GetSelectedItems(out IntPtr ppsai);
}

public class ModernFolderPicker {
    public static string ShowDialog(string title, IntPtr owner) {
        IFileOpenDialog dlg = (IFileOpenDialog)new FileOpenDialogRCW();
        try {
            uint options;
            dlg.GetOptions(out options);
            dlg.SetOptions(options | 0x20u);
            dlg.SetTitle(title);
            if (dlg.Show(owner) == 0) {
                IShellItem result = dlg.GetResult();
                string path;
                result.GetDisplayName(0x80058000u, out path);
                return path ?? "";
            }
        } catch {}
        finally { Marshal.FinalReleaseComObject(dlg); }
        return "";
    }
}
"@

# Create a hidden topmost form to own the dialog and bring it to front
$form = New-Object System.Windows.Forms.Form
$form.TopMost = $true
$form.ShowInTaskbar = $false
$form.WindowState = 'Minimized'
$form.Opacity = 0
$form.Show()

$result = [ModernFolderPicker]::ShowDialog("Select default directory", $form.Handle)
$form.Close()
$form.Dispose()
if ($result) { Write-Output $result }
