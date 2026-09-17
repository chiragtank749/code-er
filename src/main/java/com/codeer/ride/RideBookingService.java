package com.codeer.ride;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;

/**
 * RideBookingService - the heart of our ride app.
 *
 * Written in 2016 by Ramesh. Ramesh left in 2017.
 * Pricing, drivers, bookings, cancellations, ratings and SMS all live here.
 * It works. Nobody knows why. Please be careful.
 */
public class RideBookingService {

    // d = {name, type, available (Y/N), rating total, rating count}
    private ArrayList<String[]> drv = new ArrayList<String[]>();

    // r = {id, rider, phone, pickup, drop, km, type, fare, driver, status}
    private HashMap<String, Object[]> rides = new HashMap<String, Object[]>();

    private List<String> sms = new ArrayList<String>();
    private int counter = 1000;
    private String lastError = "";

    public boolean registerDriver(String name, String vehicleType) {
        if (name == null || name.trim().equals("")) {
            return false;
        }
        if (vehicleType == null || !(vehicleType.equalsIgnoreCase("MINI")
                || vehicleType.equalsIgnoreCase("SEDAN") || vehicleType.equalsIgnoreCase("SUV"))) {
            return false;
        }
        boolean flg = false;
        for (int i = 0; i < drv.size(); i++) {
            if (drv.get(i)[0].equals(name)) {
                flg = true;
            }
        }
        if (flg) {
            return false;
        }
        drv.add(new String[]{name, vehicleType, "Y", "5", "1"});
        System.out.println("driver added: " + name);
        return true;
    }

    // fare logic. DO NOT CHANGE. finance team checked it in 2016.
    public double calcFare(String type, double km, int hour, String promo) {
        double f = 0;
        if (type.equalsIgnoreCase("MINI")) {
            if (km <= 10) {
                f = km * 12;
            } else {
                f = km * 10;
            }
        } else if (type.equalsIgnoreCase("SEDAN")) {
            if (km <= 10) {
                f = km * 15;
            } else {
                f = km * 13;
            }
        } else if (type.equalsIgnoreCase("SUV")) {
            if (km <= 10) {
                f = km * 20;
            } else {
                f = km * 17;
            }
            // night
            if (hour >= 22 || hour < 6) {
                f = f * 1.25;
            }
        } else {
            throw new IllegalArgumentException("bad type: " + type);
        }
        // promo
        if (promo != null && !promo.equals("") && !promo.equals("NONE")) {
            if (promo.equals("FLAT30")) {
                f = f - 30;
            } else {
                f = f * 0.9;
            }
        }
        // minimum
        if (type.equalsIgnoreCase("MINI") && f < 50) f = 50;
        if (type.equalsIgnoreCase("SEDAN") && f < 70) f = 70;
        if (type.equalsIgnoreCase("SUV") && f < 100) f = 100;
        return Math.round(f);
    }

    public String bookRide(String riderName, String riderPhone, String pickup, String drop,
                           double km, String type, int hour, String promo, boolean sendSms) {
        if (riderName != null && !riderName.trim().equals("")) {
            if (riderPhone != null && riderPhone.matches("\\d{10}")) {
                if (km > 0 && km <= 100) {
                    if (type != null && (type.equalsIgnoreCase("MINI")
                            || type.equalsIgnoreCase("SEDAN") || type.equalsIgnoreCase("SUV"))) {
                        // find a free driver
                        String[] d = null;
                        for (int i = 0; i < drv.size(); i++) {
                            String[] x = drv.get(i);
                            if (x[1].equalsIgnoreCase(type) && x[2].equals("Y")) {
                                d = x;
                                break;
                            }
                        }
                        if (d == null) {
                            lastError = "no driver for " + type;
                            return "ERR:NO_DRIVER";
                        }
                        // fare (same as calcFare)
                        double f = 0;
                        if (type.equalsIgnoreCase("MINI")) {
                            if (km <= 10) f = km * 12; else f = km * 10;
                        } else if (type.equalsIgnoreCase("SEDAN")) {
                            if (km <= 10) f = km * 15; else f = km * 13;
                        } else {
                            if (km <= 10) f = km * 20; else f = km * 17;
                            if (hour >= 22 || hour < 6) f = f * 1.25;
                        }
                        if (type.equalsIgnoreCase("MINI") && f < 50) f = 50;
                        if (type.equalsIgnoreCase("SEDAN") && f < 70) f = 70;
                        if (type.equalsIgnoreCase("SUV") && f < 100) f = 100;
                        if (promo != null && !promo.equals("") && !promo.equals("NONE")) {
                            if (promo.equals("FLAT30")) {
                                f = f - 30;
                            } else {
                                f = f * 0.9;
                            }
                        }
                        f = Math.round(f);

                        counter++;
                        String id = "RIDE-" + counter;
                        d[2] = "N";
                        rides.put(id, new Object[]{id, riderName, riderPhone, pickup, drop, km,
                                type.toUpperCase(), f, d[0], "BOOKED"});
                        if (sendSms) {
                            String masked = "******" + riderPhone.substring(6);
                            sms.add("SMS to " + masked + ": Ride " + id + " confirmed. Driver "
                                    + d[0] + ". Fare Rs." + (int) f);
                        }
                        System.out.println("booked " + id + " for " + riderName);
                        return id;
                    } else {
                        return "ERR:TYPE";
                    }
                } else {
                    return "ERR:DISTANCE";
                }
            } else {
                return "ERR:PHONE";
            }
        } else {
            return "ERR:NAME";
        }
    }

    public double getRideFare(String rideId) {
        Object[] r = rides.get(rideId);
        if (r == null) {
            return -1;
        }
        return (Double) r[7];
    }

    public String getRideSummary(String rideId) {
        Object[] r = rides.get(rideId);
        if (r == null) {
            return "NOT FOUND";
        }
        return r[0] + " | " + r[1] + " | " + r[6] + " | " + r[5] + " km | Rs."
                + ((Double) r[7]).intValue() + " | " + r[8] + " | " + r[9];
    }

    public double cancelRide(String rideId, int minutesSinceBooking) {
        Object[] r = rides.get(rideId);
        if (r == null) {
            return -1;
        }
        if (!r[9].equals("BOOKED")) {
            return 0;
        }
        double fee = 0;
        if (minutesSinceBooking > 5) {
            String t = (String) r[6];
            if (t.equals("MINI")) {
                fee = 25;
            } else if (t.equals("SEDAN")) {
                fee = 40;
            } else {
                fee = 60;
            }
        }
        r[9] = "CANCELLED";
        for (int i = 0; i < drv.size(); i++) {
            if (drv.get(i)[0].equals(r[8])) {
                drv.get(i)[2] = "Y";
            }
        }
        return fee;
    }

    public String completeRide(String rideId, int rating) {
        Object[] r = rides.get(rideId);
        if (r == null) {
            return "ERR:RIDE";
        }
        if (!r[9].equals("BOOKED")) {
            return "ERR:STATE";
        }
        if (rating < 1 || rating > 5) {
            return "ERR:RATING";
        }
        r[9] = "COMPLETED";
        for (int i = 0; i < drv.size(); i++) {
            String[] x = drv.get(i);
            if (x[0].equals(r[8])) {
                x[2] = "Y";
                double tot = Double.parseDouble(x[3]) + rating;
                int cnt = Integer.parseInt(x[4]) + 1;
                x[3] = String.valueOf(tot);
                x[4] = String.valueOf(cnt);
            }
        }
        return "OK";
    }

    public double getDriverRating(String driverName) {
        for (String[] x : drv) {
            if (x[0].equals(driverName)) {
                double avg = Double.parseDouble(x[3]) / Integer.parseInt(x[4]);
                return Math.round(avg * 10) / 10.0;
            }
        }
        return 0;
    }

    public int availableDrivers(String vehicleType) {
        int c = 0;
        for (String[] x : drv) {
            if (x[1].equalsIgnoreCase(vehicleType) && x[2].equals("Y")) {
                c++;
            }
        }
        return c;
    }

    public List<String> getSmsLog() {
        return sms;
    }

    // old fare calc - keep just in case
    private double calc2(double km, double rate) {
        double tmp = km * rate;
        if (tmp < 0) {
            tmp = 0;
        }
        return tmp;
    }
}
