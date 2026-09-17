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

    private static final String MINI = "MINI";
    private static final String SEDAN = "SEDAN";
    private static final String SUV = "SUV";

    private static final String AVAILABLE = "Y";
    private static final String BUSY = "N";

    private static final String STATUS_BOOKED = "BOOKED";
    private static final String STATUS_CANCELLED = "CANCELLED";
    private static final String STATUS_COMPLETED = "COMPLETED";

    private static final String ERR_NAME = "ERR:NAME";
    private static final String ERR_PHONE = "ERR:PHONE";
    private static final String ERR_DISTANCE = "ERR:DISTANCE";
    private static final String ERR_TYPE = "ERR:TYPE";
    private static final String ERR_NO_DRIVER = "ERR:NO_DRIVER";
    private static final String ERR_RIDE = "ERR:RIDE";
    private static final String ERR_STATE = "ERR:STATE";
    private static final String ERR_RATING = "ERR:RATING";

    private static final String OK = "OK";
    private static final String NOT_FOUND = "NOT FOUND";
    private static final String NONE = "NONE";
    private static final String FLAT30 = "FLAT30";
    private static final String RIDE_ID_PREFIX = "RIDE-";
    private static final String PHONE_PATTERN = "\\d{10}";

    private static final int FIRST_RIDE_NUMBER = 1000;
    private static final int FREE_CANCELLATION_MINUTES = 5;
    private static final int MIN_RATING = 1;
    private static final int MAX_RATING = 5;

    private static final int DRIVER_NAME = 0;
    private static final int DRIVER_TYPE = 1;
    private static final int DRIVER_AVAILABLE = 2;
    private static final int DRIVER_RATING_TOTAL = 3;
    private static final int DRIVER_RATING_COUNT = 4;

    private static final int RIDE_ID = 0;
    private static final int RIDE_RIDER = 1;
    private static final int RIDE_KM = 5;
    private static final int RIDE_TYPE = 6;
    private static final int RIDE_FARE = 7;
    private static final int RIDE_DRIVER = 8;
    private static final int RIDE_STATUS = 9;

    // d = {name, type, available (Y/N), rating total, rating count}
    private final ArrayList<String[]> drv = new ArrayList<>();

    // r = {id, rider, phone, pickup, drop, km, type, fare, driver, status}
    private final HashMap<String, Object[]> rides = new HashMap<>();

    private final List<String> sms = new ArrayList<>();
    private int counter = FIRST_RIDE_NUMBER;
    private String lastError = "";

    public boolean registerDriver(String name, String vehicleType) {
        if (isBlank(name)) {
            return false;
        }
        if (!isValidVehicleType(vehicleType)) {
            return false;
        }
        if (driverExists(name)) {
            return false;
        }
        drv.add(new String[]{name, vehicleType, AVAILABLE, "5", "1"});
        System.out.println("driver added: " + name);
        return true;
    }

    // fare logic. DO NOT CHANGE. finance team checked it in 2016.
    public double calcFare(String type, double km, int hour, String promo) {
        double fare = baseFare(type, km, hour);
        fare = applyPromo(fare, promo);
        fare = applyMinimum(type, fare);
        return roundFare(fare);
    }

    public String bookRide(String riderName, String riderPhone, String pickup, String drop,
                           double km, String type, int hour, String promo, boolean sendSms) {
        String validationError = validateBooking(riderName, riderPhone, km, type);
        if (validationError != null) {
            return validationError;
        }

        String[] driver = findFirstAvailableDriver(type);
        if (driver == null) {
            lastError = "no driver for " + type;
            return ERR_NO_DRIVER;
        }

        double fare = bookedFare(type, km, hour, promo);
        String rideId = nextRideId();

        driver[DRIVER_AVAILABLE] = BUSY;
        rides.put(rideId, new Object[]{
                rideId, riderName, riderPhone, pickup, drop, km,
                type.toUpperCase(), fare, driver[DRIVER_NAME], STATUS_BOOKED
        });

        if (sendSms) {
            sms.add(buildConfirmationSms(rideId, riderPhone, driver[DRIVER_NAME], fare));
        }

        System.out.println("booked " + rideId + " for " + riderName);
        return rideId;
    }

    public double getRideFare(String rideId) {
        Object[] ride = rides.get(rideId);
        if (ride == null) {
            return -1;
        }
        return (Double) ride[RIDE_FARE];
    }

    public String getRideSummary(String rideId) {
        Object[] ride = rides.get(rideId);
        if (ride == null) {
            return NOT_FOUND;
        }
        return ride[RIDE_ID] + " | " + ride[RIDE_RIDER] + " | " + ride[RIDE_TYPE] + " | "
                + ride[RIDE_KM] + " km | Rs." + ((Double) ride[RIDE_FARE]).intValue()
                + " | " + ride[RIDE_DRIVER] + " | " + ride[RIDE_STATUS];
    }

    public double cancelRide(String rideId, int minutesSinceBooking) {
        Object[] ride = rides.get(rideId);
        if (ride == null) {
            return -1;
        }
        if (!STATUS_BOOKED.equals(ride[RIDE_STATUS])) {
            return 0;
        }

        double fee = 0;
        if (minutesSinceBooking > FREE_CANCELLATION_MINUTES) {
            fee = cancellationFee((String) ride[RIDE_TYPE]);
        }

        ride[RIDE_STATUS] = STATUS_CANCELLED;
        releaseDriver((String) ride[RIDE_DRIVER]);
        return fee;
    }

    public String completeRide(String rideId, int rating) {
        Object[] ride = rides.get(rideId);
        if (ride == null) {
            return ERR_RIDE;
        }
        if (!STATUS_BOOKED.equals(ride[RIDE_STATUS])) {
            return ERR_STATE;
        }
        if (rating < MIN_RATING || rating > MAX_RATING) {
            return ERR_RATING;
        }

        ride[RIDE_STATUS] = STATUS_COMPLETED;
        releaseAndRateDriver((String) ride[RIDE_DRIVER], rating);
        return OK;
    }

    public double getDriverRating(String driverName) {
        for (String[] driver : drv) {
            if (driver[DRIVER_NAME].equals(driverName)) {
                double average = Double.parseDouble(driver[DRIVER_RATING_TOTAL])
                        / Integer.parseInt(driver[DRIVER_RATING_COUNT]);
                return Math.round(average * 10) / 10.0;
            }
        }
        return 0;
    }

    public int availableDrivers(String vehicleType) {
        int count = 0;
        for (String[] driver : drv) {
            if (driver[DRIVER_TYPE].equalsIgnoreCase(vehicleType)
                    && AVAILABLE.equals(driver[DRIVER_AVAILABLE])) {
                count++;
            }
        }
        return count;
    }

    public List<String> getSmsLog() {
        return sms;
    }

    private boolean isBlank(String value) {
        return value == null || value.trim().equals("");
    }

    private boolean isValidVehicleType(String vehicleType) {
        return vehicleType != null && (vehicleType.equalsIgnoreCase(MINI)
                || vehicleType.equalsIgnoreCase(SEDAN)
                || vehicleType.equalsIgnoreCase(SUV));
    }

    private boolean driverExists(String name) {
        for (String[] driver : drv) {
            if (driver[DRIVER_NAME].equals(name)) {
                return true;
            }
        }
        return false;
    }

    private String validateBooking(String riderName, String riderPhone, double km, String type) {
        if (isBlank(riderName)) {
            return ERR_NAME;
        }
        if (riderPhone == null || !riderPhone.matches(PHONE_PATTERN)) {
            return ERR_PHONE;
        }
        if (!(km > 0 && km <= 100)) {
            return ERR_DISTANCE;
        }
        if (!isValidVehicleType(type)) {
            return ERR_TYPE;
        }
        return null;
    }

    private String[] findFirstAvailableDriver(String vehicleType) {
        for (String[] driver : drv) {
            if (driver[DRIVER_TYPE].equalsIgnoreCase(vehicleType)
                    && AVAILABLE.equals(driver[DRIVER_AVAILABLE])) {
                return driver;
            }
        }
        return null;
    }

    private double bookedFare(String type, double km, int hour, String promo) {
        double fare = baseFare(type, km, hour);
        fare = applyMinimum(type, fare);
        fare = applyPromo(fare, promo);
        return roundFare(fare);
    }

    private double baseFare(String type, double km, int hour) {
        double fare;
        if (type.equalsIgnoreCase(MINI)) {
            if (km <= 10) {
                fare = km * 12;
            } else {
                fare = km * 10;
            }
        } else if (type.equalsIgnoreCase(SEDAN)) {
            if (km <= 10) {
                fare = km * 15;
            } else {
                fare = km * 13;
            }
        } else if (type.equalsIgnoreCase(SUV)) {
            if (km <= 10) {
                fare = km * 20;
            } else {
                fare = km * 17;
            }
            if (hour >= 22 || hour < 6) {
                fare = fare * 1.25;
            }
        } else {
            throw new IllegalArgumentException("bad type: " + type);
        }
        return fare;
    }

    private double applyPromo(double fare, String promo) {
        if (promo != null && !promo.equals("") && !promo.equals(NONE)) {
            if (promo.equals(FLAT30)) {
                fare = fare - 30;
            } else {
                fare = fare * 0.9;
            }
        }
        return fare;
    }

    private double applyMinimum(String type, double fare) {
        if (type.equalsIgnoreCase(MINI) && fare < 50) {
            return 50;
        }
        if (type.equalsIgnoreCase(SEDAN) && fare < 70) {
            return 70;
        }
        if (type.equalsIgnoreCase(SUV) && fare < 100) {
            return 100;
        }
        return fare;
    }

    private double roundFare(double fare) {
        return Math.round(fare);
    }

    private String nextRideId() {
        counter++;
        return RIDE_ID_PREFIX + counter;
    }

    private String buildConfirmationSms(String rideId, String riderPhone, String driverName, double fare) {
        String maskedPhone = "******" + riderPhone.substring(6);
        return "SMS to " + maskedPhone + ": Ride " + rideId + " confirmed. Driver "
                + driverName + ". Fare Rs." + (int) fare;
    }

    private double cancellationFee(String type) {
        if (type.equals(MINI)) {
            return 25;
        }
        if (type.equals(SEDAN)) {
            return 40;
        }
        return 60;
    }

    private void releaseDriver(String driverName) {
        for (String[] driver : drv) {
            if (driver[DRIVER_NAME].equals(driverName)) {
                driver[DRIVER_AVAILABLE] = AVAILABLE;
            }
        }
    }

    private void releaseAndRateDriver(String driverName, int rating) {
        for (String[] driver : drv) {
            if (driver[DRIVER_NAME].equals(driverName)) {
                driver[DRIVER_AVAILABLE] = AVAILABLE;
                double total = Double.parseDouble(driver[DRIVER_RATING_TOTAL]) + rating;
                int count = Integer.parseInt(driver[DRIVER_RATING_COUNT]) + 1;
                driver[DRIVER_RATING_TOTAL] = String.valueOf(total);
                driver[DRIVER_RATING_COUNT] = String.valueOf(count);
            }
        }
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
