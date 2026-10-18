package com.codeer.ride;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.PrintStream;
import java.util.ArrayList;
import java.util.List;

// Test-only: runs Safety Net Lab probes against the REAL patient-v0 class.
// Input: one TSV line per probe, "<null>" = null. Output: canonical result, newlines escaped.
public class ParityHarness {
    static String n(String s) { return s.equals("<null>") ? null : s; }
    static String jd(double d) { return String.valueOf(d); }

    static RideBookingService fixture() {
        RideBookingService s = new RideBookingService();
        s.registerDriver("Asha", "MINI");
        s.registerDriver("Bala", "SEDAN");
        s.registerDriver("Chen", "SUV");
        return s;
    }

    static String run(String[] f) {
        switch (f[0]) {
            case "fare":
                try {
                    return "fare=" + jd(new RideBookingService().calcFare(n(f[1]), Double.parseDouble(f[2]), Integer.parseInt(f[3]), n(f[4])));
                } catch (RuntimeException e) {
                    return "error=" + (e instanceof NullPointerException ? e.getClass().getName() : e.toString());
                }
            case "book": {
                RideBookingService s = fixture();
                String type = n(f[3]);
                String id = s.bookRide(n(f[1]), n(f[2]), "Gate 1", "Gate 2", Double.parseDouble(f[4]), type, Integer.parseInt(f[5]), n(f[6]), true);
                return "id=" + id + "\nfare=" + jd(s.getRideFare(id)) + "\nsummary=" + s.getRideSummary(id)
                        + "\nsms=[" + String.join(" || ", s.getSmsLog()) + "]\nfree=" + (type == null ? 0 : s.availableDrivers(type));
            }
            case "cancel": {
                RideBookingService s = fixture();
                String type = n(f[1]);
                String id = s.bookRide("Riya", "9876543210", "Gate 1", "Gate 2", Double.parseDouble(f[2]), type, 12, null, false);
                String done = f[4].equals("true") ? s.completeRide(id, 5) : "-";
                double fee = s.cancelRide(id, Integer.parseInt(f[3]));
                return "id=" + id + "\ncomplete=" + done + "\nfee=" + jd(fee) + "\nsummary=" + s.getRideSummary(id)
                        + "\nfree=" + (type == null ? 0 : s.availableDrivers(type));
            }
            case "rate": {
                RideBookingService s = fixture();
                List<String> res = new ArrayList<>();
                for (String r : f[1].split(",")) {
                    String id = s.bookRide("Riya", "9876543210", "A", "B", 5, "MINI", 12, null, false);
                    res.add(s.completeRide(id, Integer.parseInt(r)));
                }
                return "complete=[" + String.join(",", res) + "]\nrating=" + jd(s.getDriverRating("Asha"));
            }
            case "register": {
                RideBookingService s = new RideBookingService();
                boolean a = s.registerDriver(n(f[1]), n(f[2]));
                boolean b = s.registerDriver(n(f[3]), n(f[4]));
                String t1 = n(f[2]);
                return "first=" + a + "\nsecond=" + b + "\nfree1=" + (t1 == null ? 0 : s.availableDrivers(t1));
            }
            default:
                return "unknown";
        }
    }

    public static void main(String[] args) throws Exception {
        PrintStream out = System.out;
        System.setOut(new PrintStream(new java.io.ByteArrayOutputStream()));
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in, "UTF-8"));
        String line;
        while ((line = in.readLine()) != null) {
            out.println(run(line.split("\t", -1)).replace("\\", "\\\\").replace("\n", "\\n"));
        }
        out.flush();
    }
}
