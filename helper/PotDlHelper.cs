// Chrome native messaging host: saves subtitles and hands them to PotPlayer.

using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Management;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.RegularExpressions;
using System.Web.Script.Serialization;
using Microsoft.Win32;

[assembly: AssemblyTitle("PotDl Helper")]
[assembly: AssemblyProduct("PotDl")]
[assembly: AssemblyVersion("1.0.0.0")]

static class PotDlHelper
{
    const int KeepDays = 3;
    const int MaxMessageBytes = 64 * 1024 * 1024;

    static readonly string SubtitleDir = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "PotDl", "Subtitles");
    static readonly string[] AllowedExtensions = { "srt", "ass", "ssa", "vtt", "sub" };
    static readonly string[] PlayerProcesses = { "PotPlayerMini64", "PotPlayer64", "PotPlayerMini", "PotPlayer" };
    static readonly JavaScriptSerializer Json = new JavaScriptSerializer { MaxJsonLength = int.MaxValue };

    [DllImport("kernel32.dll")] static extern IntPtr GlobalAlloc(uint flags, UIntPtr bytes);
    [DllImport("kernel32.dll")] static extern IntPtr GlobalLock(IntPtr handle);
    [DllImport("kernel32.dll")] static extern bool GlobalUnlock(IntPtr handle);
    [DllImport("user32.dll")] static extern bool PostMessage(IntPtr hwnd, uint msg, IntPtr wParam, IntPtr lParam);

    static int Main()
    {
        Dictionary<string, object> reply;
        try
        {
            reply = Handle(Json.Deserialize<Dictionary<string, object>>(ReadMessage()));
        }
        catch (Exception error)
        {
            reply = new Dictionary<string, object> { { "ok", false }, { "error", error.Message } };
        }
        WriteMessage(Json.Serialize(reply));
        return 0;
    }

    static string ReadMessage()
    {
        using (Stream input = Console.OpenStandardInput())
        {
            byte[] header = ReadExactly(input, 4);
            int length = BitConverter.ToInt32(header, 0);
            if (length < 0 || length > MaxMessageBytes) throw new InvalidDataException("Message is too large");
            return Encoding.UTF8.GetString(ReadExactly(input, length));
        }
    }

    static byte[] ReadExactly(Stream input, int length)
    {
        byte[] buffer = new byte[length];
        int total = 0;
        while (total < length)
        {
            int count = input.Read(buffer, total, length - total);
            if (count <= 0) throw new EndOfStreamException("Message ended early");
            total += count;
        }
        return buffer;
    }

    static void WriteMessage(string message)
    {
        byte[] body = Encoding.UTF8.GetBytes(message);
        using (Stream output = Console.OpenStandardOutput())
        {
            output.Write(BitConverter.GetBytes(body.Length), 0, 4);
            output.Write(body, 0, body.Length);
            output.Flush();
        }
    }

    static Dictionary<string, object> Ok()
    {
        return new Dictionary<string, object> { { "ok", true } };
    }

    static bool IsSet(Dictionary<string, object> message, string key)
    {
        object value;
        return message.TryGetValue(key, out value) && value is bool && (bool)value;
    }

    static string Text(Dictionary<string, object> message, string key)
    {
        object value;
        return message.TryGetValue(key, out value) ? value as string : null;
    }

    static Dictionary<string, object> Handle(Dictionary<string, object> message)
    {
        if (IsSet(message, "ping")) return Ok();
        if (IsSet(message, "nowPlaying")) return NowPlaying();

        string arguments = Quote(SafeUrl(Text(message, "url")));

        object subtitle;
        if (message.TryGetValue("subtitle", out subtitle) && subtitle is Dictionary<string, object>)
        {
            string path = SaveSubtitle((Dictionary<string, object>)subtitle, Text(message, "fileName"));
            Process window = FindPlayerWindow();
            if (IsSet(message, "replace") && window != null)
            {
                DropFile(window.MainWindowHandle, path);
                return Ok();
            }
            arguments += " /sub=" + Quote(path);
        }

        Process.Start(new ProcessStartInfo(FindPotPlayer(), arguments) { UseShellExecute = true });
        return Ok();
    }

    static string Quote(string value)
    {
        return "\"" + value + "\"";
    }

    static string SafeUrl(string url)
    {
        Uri uri;
        if (!Uri.TryCreate(url, UriKind.Absolute, out uri) || (uri.Scheme != "http" && uri.Scheme != "https"))
        {
            throw new ArgumentException("Only http and https links are supported");
        }
        // The URL ends up inside a quoted command-line argument.
        return url.Replace("\"", "%22").Replace(" ", "%20").Replace("\\", "%5C");
    }

    static string SaveSubtitle(Dictionary<string, object> subtitle, string fileName)
    {
        string extension = Text(subtitle, "extension");
        if (!AllowedExtensions.Contains(extension)) throw new ArgumentException("Unsupported subtitle format");

        Directory.CreateDirectory(SubtitleDir);
        foreach (string old in Directory.GetFiles(SubtitleDir))
        {
            if (File.GetLastWriteTime(old) < DateTime.Now.AddDays(-KeepDays)) File.Delete(old);
        }

        string safeName = Regex.Replace(fileName ?? "subtitle", "[^A-Za-z0-9._-]", "_");
        string path = Path.Combine(SubtitleDir, safeName + "." + extension);
        File.WriteAllText(path, Text(subtitle, "text"), new UTF8Encoding(true));
        return path;
    }

    static Process FindPlayerWindow()
    {
        return PlayerProcesses
            .SelectMany(Process.GetProcessesByName)
            .FirstOrDefault(process => process.MainWindowHandle != IntPtr.Zero);
    }

    static string FindPotPlayer()
    {
        var candidates = new List<string>
        {
            Registry.GetValue(@"HKEY_CURRENT_USER\Software\DAUM\PotPlayer64", "ProgramPath", null) as string,
            Registry.GetValue(@"HKEY_CURRENT_USER\Software\DAUM\PotPlayer", "ProgramPath", null) as string,
        };
        foreach (string folder in new[] { "ProgramW6432", "ProgramFiles(x86)", "ProgramFiles" })
        {
            string root = Environment.GetEnvironmentVariable(folder);
            if (root == null) continue;
            candidates.Add(Path.Combine(root, @"DAUM\PotPlayer\PotPlayerMini64.exe"));
            candidates.Add(Path.Combine(root, @"DAUM\PotPlayer\PotPlayerMini.exe"));
        }

        string found = candidates.FirstOrDefault(File.Exists);
        if (found == null) throw new FileNotFoundException("PotPlayer wasn't found. Install it, then try again.");
        return found;
    }

    static Dictionary<string, object> NowPlaying()
    {
        var reply = Ok();
        reply["title"] = "";
        reply["url"] = "";

        Process window = FindPlayerWindow();
        if (window == null) return reply;

        reply["title"] = Regex.Replace(window.MainWindowTitle, " - PotPlayer$", "");
        // Links arrive as "https://host/..." or, through the protocol handler, "potplayer://https//host/...".
        Match link = Regex.Match(CommandLineOf(window.Id), "\"(?:potplayer://)?(https?):?//([^\"]+)\"", RegexOptions.IgnoreCase);
        if (link.Success) reply["url"] = link.Groups[1].Value + "://" + link.Groups[2].Value;
        return reply;
    }

    static string CommandLineOf(int processId)
    {
        string query = "SELECT CommandLine FROM Win32_Process WHERE ProcessId=" + processId;
        using (var searcher = new ManagementObjectSearcher(query))
        {
            foreach (ManagementBaseObject process in searcher.Get())
            {
                return process["CommandLine"] as string ?? "";
            }
        }
        return "";
    }

    // Same as dragging the file onto the player: the video keeps playing.
    static void DropFile(IntPtr window, string path)
    {
        const int HeaderSize = 20;
        const int WideCharsOffset = 16;
        const uint MovableZeroed = 0x0042;
        const uint WmDropFiles = 0x0233;

        byte[] name = Encoding.Unicode.GetBytes(path + "\0\0");
        IntPtr handle = GlobalAlloc(MovableZeroed, (UIntPtr)(uint)(HeaderSize + name.Length));
        IntPtr data = GlobalLock(handle);
        Marshal.WriteInt32(data, 0, HeaderSize);
        Marshal.WriteInt32(data, WideCharsOffset, 1);
        Marshal.Copy(name, 0, IntPtr.Add(data, HeaderSize), name.Length);
        GlobalUnlock(handle);
        if (!PostMessage(window, WmDropFiles, handle, IntPtr.Zero))
        {
            throw new InvalidOperationException("PotPlayer did not accept the subtitle");
        }
    }
}
