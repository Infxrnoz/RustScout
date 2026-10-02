using System;
using System.Globalization;
using System.Runtime.InteropServices;
using System.Windows.Forms;

static class Gamma
{
    [StructLayout(LayoutKind.Sequential)]
    struct Ramp
    {
        [MarshalAs(UnmanagedType.ByValArray, SizeConst = 256)] public ushort[] Red;
        [MarshalAs(UnmanagedType.ByValArray, SizeConst = 256)] public ushort[] Green;
        [MarshalAs(UnmanagedType.ByValArray, SizeConst = 256)] public ushort[] Blue;
    }
    [StructLayout(LayoutKind.Sequential)]
    struct ColorEffect { [MarshalAs(UnmanagedType.ByValArray, SizeConst = 25)] public float[] M; }

    [DllImport("gdi32.dll")] static extern bool SetDeviceGammaRamp(IntPtr hdc, ref Ramp ramp);
    [DllImport("gdi32.dll", CharSet = CharSet.Auto)] static extern IntPtr CreateDC(string driver, string device, string output, IntPtr init);
    [DllImport("gdi32.dll")] static extern bool DeleteDC(IntPtr hdc);
    [DllImport("Magnification.dll")] static extern bool MagInitialize();
    [DllImport("Magnification.dll")] static extern bool MagUninitialize();
    [DllImport("Magnification.dll")] static extern bool MagSetFullscreenColorEffect(ref ColorEffect effect);

    static readonly CultureInfo Inv = CultureInfo.InvariantCulture;
    static bool magReady;
    static bool filterOn;

    static Ramp BuildRamp(double gamma, double lift, double strength)
    {
        var r = new Ramp { Red = new ushort[256], Green = new ushort[256], Blue = new ushort[256] };
        for (int i = 0; i < 256; i++)
        {
            double x = i / 255.0;
            double boosted = lift + (1 - lift) * Math.Pow(x, 1.0 / gamma);
            double y = x + (boosted - x) * strength;
            ushort v = (ushort)Math.Max(0, Math.Min(65535, Math.Round(y * 65535)));
            r.Red[i] = r.Green[i] = r.Blue[i] = v;
        }
        return r;
    }

    static double TryRamp(double gamma, double lift)
    {
        bool reset = gamma == 1.0 && lift == 0.0;
        double worst = 1.0;
        int done = 0, total = 0;
        foreach (var screen in Screen.AllScreens)
        {
            total++;
            IntPtr dc = CreateDC(null, screen.DeviceName, null, IntPtr.Zero);
            if (dc == IntPtr.Zero) continue;
            double applied = -1;
            for (double s = 1.0; s > 0.05; s -= 0.05)
            {
                var ramp = BuildRamp(gamma, lift, reset ? 0 : s);
                if (SetDeviceGammaRamp(dc, ref ramp)) { applied = reset ? 1 : s; break; }
                if (reset) break;
            }
            DeleteDC(dc);
            if (applied >= 0) { done++; worst = Math.Min(worst, applied); }
        }
        return total > 0 && done == total ? worst : -1;
    }

    static bool SetFilter(double gamma, double lift)
    {
        if (!magReady) magReady = MagInitialize();
        if (!magReady) return false;
        float gain = (float)(1 + (gamma - 1) * 0.5), offset = (float)(lift + (gamma - 1) * 0.015);
        var e = new ColorEffect { M = new float[25] };
        e.M[0] = e.M[6] = e.M[12] = gain;
        e.M[18] = e.M[24] = 1;
        e.M[20] = e.M[21] = e.M[22] = offset;
        bool ok = MagSetFullscreenColorEffect(ref e);
        filterOn = ok && (gamma != 1.0 || lift != 0.0);
        return ok;
    }

    static string Apply(double gamma, double lift)
    {
        gamma = Math.Max(0.5, Math.Min(4.0, gamma));
        lift = Math.Max(0.0, Math.Min(0.3, lift));
        bool off = gamma == 1.0 && lift == 0.0;
        if (off)
        {
            TryRamp(1, 0);
            if (filterOn || magReady) SetFilter(1, 0);
            return "{\"ok\":true,\"method\":\"off\",\"strength\":0}";
        }
        double s = TryRamp(gamma, lift);
        if (s >= 0)
        {
            if (filterOn) SetFilter(1, 0);
            return "{\"ok\":true,\"method\":\"gamma\",\"strength\":" + s.ToString("0.00", Inv) + "}";
        }
        if (SetFilter(gamma, lift)) return "{\"ok\":true,\"method\":\"filter\",\"strength\":1}";
        return "{\"ok\":false,\"method\":\"none\",\"strength\":0}";
    }

    static void Restore()
    {
        TryRamp(1, 0);
        if (magReady) { SetFilter(1, 0); MagUninitialize(); magReady = false; }
    }

    [STAThread]
    static int Main(string[] args)
    {
        if (args.Length > 0 && args[0] == "--serve")
        {
            string line;
            while ((line = Console.ReadLine()) != null)
            {
                var parts = line.Trim().Split(' ');
                if (parts[0] == "quit") break;
                double g, l = 0;
                if (!double.TryParse(parts[0], NumberStyles.Float, Inv, out g)) { Console.WriteLine("{\"ok\":false,\"error\":\"bad input\"}"); continue; }
                if (parts.Length > 1) double.TryParse(parts[1], NumberStyles.Float, Inv, out l);
                Console.WriteLine(Apply(g, l));
                Console.Out.Flush();
            }
            Restore();
            return 0;
        }
        double gamma = args.Length > 0 ? double.Parse(args[0], Inv) : 1.0;
        double lift = args.Length > 1 ? double.Parse(args[1], Inv) : 0.0;
        double r = TryRamp(gamma, lift);
        Console.WriteLine("{\"ok\":" + (r >= 0 ? "true" : "false") + ",\"method\":\"gamma\",\"strength\":" + Math.Max(0, r).ToString("0.00", Inv) + "}");
        return r >= 0 ? 0 : 1;
    }
}
