package com.codeer.ride;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

import static org.junit.jupiter.api.Assertions.assertEquals;

/**
 * ROUND 2 - YOUR SAFETY NET.
 *
 * A characterization test records what the ORIGINAL code does today - even when it looks wrong.
 * Don't write what the code SHOULD do. Run the original, see what it DOES, and lock that in.
 *
 * Rules
 *  1. Every test in this file must pass against the original patient (tag patient-v0).
 *  2. Only call RideBookingService's public methods. No classes you create later.
 *  3. Keep this file's name and package. The trainer grades this exact file.
 *     Tests for your own new classes go in other files.
 *
 * Scoring
 *  The trainer runs this file against a set of secretly broken copies of the patient.
 *  Every broken copy your tests catch = +2 points. Tests that fail on the original don't count.
 */
class CharacterizationTest {

    @Test
    @DisplayName("Example: a 5 km MINI ride at noon costs Rs.60")
    void exampleShortMiniTrip() {
        RideBookingService svc = new RideBookingService();
        assertEquals(60.0, svc.calcFare("MINI", 5, 12, null));
    }

    // Record many inputs at once. Columns: type, km, hour, promo, expected fare.
    // An empty promo cell means null; '' means an empty string.
    @ParameterizedTest(name = "{0} {1} km at {2}:00, promo [{3}] -> Rs.{4}")
    @CsvSource({
            "MINI, 5, 12, , 60",
            // add your rows here
    })
    void fareTable(String type, double km, int hour, String promo, double expected) {
        assertEquals(expected, new RideBookingService().calcFare(type, km, hour, promo));
    }
}
