package com.codeer.ride;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * DO NOT EDIT OR DELETE THIS FILE.
 *
 * It only proves that the public contract of RideBookingService still exists.
 * If this file stops compiling, you changed a public method name, parameter or
 * return type - undo that change, because the trainer's hidden tests use them.
 */
class ContractSmokeTest {

    @Test
    @DisplayName("Patient is breathing: every public method is still callable")
    void publicContractIsIntact() {
        RideBookingService svc = new RideBookingService();

        boolean registered = svc.registerDriver("Smoke Driver", "MINI");
        double estimate = svc.calcFare("MINI", 5, 12, null);
        String rideId = svc.bookRide("Smoke Rider", "9000000000", "Gate 1", "Gate 2",
                5, "MINI", 12, null, false);
        double fare = svc.getRideFare(rideId);
        String summary = svc.getRideSummary(rideId);
        String completed = svc.completeRide(rideId, 5);
        double cancellationFee = svc.cancelRide(rideId, 1);
        double rating = svc.getDriverRating("Smoke Driver");
        int freeDrivers = svc.availableDrivers("MINI");
        List<String> smsLog = svc.getSmsLog();

        assertTrue(registered);
        assertTrue(estimate > 0);
        assertNotNull(rideId);
        assertTrue(fare > 0);
        assertNotNull(summary);
        assertNotNull(completed);
        assertTrue(cancellationFee >= 0);
        assertTrue(rating > 0);
        assertTrue(freeDrivers >= 0);
        assertNotNull(smsLog);
    }
}
