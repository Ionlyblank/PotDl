// One-step installer for the PotDl helper. It needs no admin rights and installs for the current user only.

using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Text;
using System.Web.Script.Serialization;
using Microsoft.Win32;

[assembly: AssemblyTitle("PotDl Setup")]
[assembly: AssemblyProduct("PotDl")]
[assembly: AssemblyVersion("1.0.0.0")]

static class PotDlSetup
{
    const string Title = "PotDl";
    const string HostName = "com.potdl.helper";
    const string HelperFile = "PotDlHelper.exe";
    const string UninstallerFile = "Uninstall.exe";
    const string ChromeHostKey = @"Software\Google\Chrome\NativeMessagingHosts\" + HostName;
    const string UninstallKey = @"Software\Microsoft\Windows\CurrentVersion\Uninstall\PotDl";
    const uint IconInformation = 0x40;
    const uint IconWarning = 0x30;
    const uint IconError = 0x10;

    // Every published build of the extension that may talk to the helper.
    static readonly string[] ExtensionIds = { "kdkihhmcjejiolcicjjefjepjenigaod" };

    static readonly string InstallDir = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "PotDl");

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    static extern int MessageBox(IntPtr owner, string text, string title, uint type);

    static int Main(string[] args)
    {
        bool silent = args.Contains("/silent");
        try
        {
            string message;
            if (args.Contains("/uninstall"))
            {
                Uninstall();
                message = "PotDl helper removed.";
            }
            else
            {
                Install();
                message = "PotDl is ready. You can go back to Chrome.";
                if (!PotPlayerInstalled())
                {
                    if (!silent) MessageBox(IntPtr.Zero, "PotDl is ready, but PotPlayer wasn't found. Install PotPlayer to start watching.", Title, IconWarning);
                    return 0;
                }
            }
            if (!silent) MessageBox(IntPtr.Zero, message, Title, IconInformation);
            return 0;
        }
        catch (Exception error)
        {
            if (!silent) MessageBox(IntPtr.Zero, "PotDl couldn't finish: " + error.Message, Title, IconError);
            else Console.Error.WriteLine(error);
            return 1;
        }
    }

    static bool PotPlayerInstalled()
    {
        using (RegistryKey key = Registry.ClassesRoot.OpenSubKey("potplayer"))
        {
            return key != null;
        }
    }

    static void Install()
    {
        Directory.CreateDirectory(InstallDir);

        string helper = Path.Combine(InstallDir, HelperFile);
        using (Stream embedded = Assembly.GetExecutingAssembly().GetManifestResourceStream(HelperFile))
        using (Stream file = File.Create(helper))
        {
            embedded.CopyTo(file);
        }

        string uninstaller = Path.Combine(InstallDir, UninstallerFile);
        string self = Assembly.GetExecutingAssembly().Location;
        if (!string.Equals(self, uninstaller, StringComparison.OrdinalIgnoreCase)) File.Copy(self, uninstaller, true);

        string manifest = Path.Combine(InstallDir, HostName + ".json");
        File.WriteAllText(manifest, HostManifest(helper), new UTF8Encoding(false));

        using (RegistryKey key = Registry.CurrentUser.CreateSubKey(ChromeHostKey))
        {
            key.SetValue("", manifest);
        }

        using (RegistryKey key = Registry.CurrentUser.CreateSubKey(UninstallKey))
        {
            key.SetValue("DisplayName", "PotDl helper");
            key.SetValue("DisplayVersion", "1.0.0");
            key.SetValue("Publisher", "PotDl");
            key.SetValue("DisplayIcon", uninstaller);
            key.SetValue("InstallLocation", InstallDir);
            key.SetValue("UninstallString", Quote(uninstaller) + " /uninstall");
            key.SetValue("QuietUninstallString", Quote(uninstaller) + " /uninstall /silent");
            key.SetValue("NoModify", 1, RegistryValueKind.DWord);
            key.SetValue("NoRepair", 1, RegistryValueKind.DWord);
        }
    }

    static string HostManifest(string helper)
    {
        return new JavaScriptSerializer().Serialize(new Dictionary<string, object>
        {
            { "name", HostName },
            { "description", "PotDl helper for PotPlayer" },
            { "path", helper },
            { "type", "stdio" },
            { "allowed_origins", ExtensionIds.Select(id => "chrome-extension://" + id + "/").ToArray() },
        });
    }

    static string Quote(string value)
    {
        return "\"" + value + "\"";
    }

    static void Uninstall()
    {
        Registry.CurrentUser.DeleteSubKeyTree(ChromeHostKey, false);
        Registry.CurrentUser.DeleteSubKeyTree(UninstallKey, false);

        // A running program can't delete itself, so a hidden command finishes the job after it exits.
        string command = "/d /c ping -n 3 127.0.0.1 >nul & rmdir /s /q " + Quote(InstallDir);
        Process.Start(new ProcessStartInfo("cmd.exe", command)
        {
            CreateNoWindow = true,
            UseShellExecute = false,
            WorkingDirectory = Path.GetTempPath(),
        });
    }
}
