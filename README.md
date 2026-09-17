# Code ER: the patient must survive

`RideBookingService` runs our ride-booking app. It was written in 2016, its author left in 2017, and it has no tests. One class prices trips, assigns drivers, books, cancels, rates drivers and sends SMS.

Your team's job: **refactor it into clean code without changing a single behaviour.**

The trainer has a hidden test suite: the heart monitor. After each round it checks your branch. If any behaviour changed, a vital sign dies. If the code doesn't compile, the patient flatlines.

## Get started

You need Java 17+ and Maven.

```bash
git clone <repo-url>
cd <repo-folder>
git checkout team-N        # your team's branch, for example team-3
mvn test                   # must be green before you touch anything
```

Commit small, push often, and only ever push to your own branch:

```bash
git add -A
git commit -m "Extract FareCalculator from calcFare"
git push
```

When the buzzer goes, the trainer grades whatever is on GitHub. Pushes after the buzzer don't count.

## Surgery rules

1. **The public contract is frozen.** `RideBookingService` keeps its package, class name, no-argument constructor and all 10 public methods, with the same names, parameters and return types. `ContractSmokeTest` stops compiling if you change any of them. Add as many classes, enums, records and private methods as you like.
2. **Don't fix bugs.** If something looks wrong, leave it exactly as it is and write it in `SURGERY_NOTES.md` under "Suspected bugs". Correct entries earn points; "fixing" them kills vitals.
3. **Everything must compile, including your tests.** A broken build is a flatline.
4. **Don't edit `pom.xml` or `ContractSmokeTest.java`**, and don't add dependencies. The trainer grades with an untouched copy of the pom anyway.
5. **Keep `SURGERY_NOTES.md` current:** every smell you remove, its proper name, and the refactoring you used.
6. **Roles:** Surgeon (keyboard), Diagnostician (finds smells), Anaesthetist (runs the tests), Chart Writer (keeps the notes), Chief Resident (reviews every diff before it is pushed). Swap the Surgeon every round.

AI coding assistants stay off in Round 1. The trainer will tell you the rule for Round 3.

## The rounds

| Round | Time | What you do |
|---|---|---|
| Briefing | 10 min | Clone, check out your branch, get `mvn test` green |
| 1. Blind surgery | 25 min | Refactor with no safety net. Push before the buzzer. |
| Autopsy | 15 min | The monitor shows which vitals died on each branch |
| 2. Stabilise | 20 min | Reset the patient, then write characterization tests |
| 3. Surgery with a monitor | 30 min | Refactor again, running your own tests after every step |
| Final monitor and reveal | 20 min | Scores, hidden tests and answer keys |

### Round 2: reset the patient, then build a safety net

Undo your Round 1 changes to the production code (your test files stay):

```bash
git restore --source=patient-v0 --staged --worktree -- src/main/java
git commit -m "Reset patient for round 2"
git push
```

Then write tests in `src/test/java/com/codeer/ride/CharacterizationTest.java`. A characterization test records what the original code **does**, not what it should do: call it, look at the result, lock that result in.

- Every test in that file must pass on the original code.
- Only call `RideBookingService`'s public methods in that file. Tests for your own new classes go in other files.
- Probe the edges: every number in an `if`, letter case, unknown values, empty strings, nulls, and anything that looks like a bug.
- `@ParameterizedTest` with `@CsvSource` records many inputs at once. The template shows how.

The trainer runs this file against a set of secretly broken copies of the patient. Every broken copy your tests catch earns points.

### Round 3: Vitals Check tokens

Each team has 2 tokens. When you spend one, the trainer runs the hidden monitor on your branch and tells you how many vitals are alive, but not which ones. Each token costs 3 points.

## Scoring

| What | Points |
|---|---|
| Round 1 survival | 20, minus 2 per dead vital |
| Round 3 survival | 40, minus 5 per dead vital |
| Safety net: broken copies caught by your `CharacterizationTest` | +2 each |
| Smells removed and correctly named in `SURGERY_NOTES.md` | +3 each (up to 10 smells) |
| Real suspected bugs logged instead of fixed | +2 each |
| Vitals Check token used | -3 each |

A flatline, or a round with no changes to `src/main/java`, scores 0 for that round.

## After the game

The hidden tests are published on the `reveal` branch. Run them against your own code:

```bash
git fetch origin
git checkout origin/reveal -- src/test/java/com/codeer/ride/VitalsTest.java
mvn test
```

A clean refactor that keeps every behaviour is on the `model-solution` branch.
