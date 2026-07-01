import * as fs from 'fs';

const totalDayDriveMinutes: number = 12 * 60;

interface Job {
    id: number;
    pickup: [number, number];
    dropoff: [number, number];
}

let file: string = '';

//get all the arguments passed into the program
process.argv.forEach(function (val) {
    file = val;
});

fs.readFile(file, 'utf8', function (err, data) {
    if (err) {
        if (err.code === 'ENOENT') {
            console.error('File not found:', err.path);
        } else {
            console.error('Error reading file:', err);
        }
        return;
    }

    const lines = data.toString().split('\n');
    const jobs = parseFile(lines);
    const routes = buildRoutes(jobs);

    for (const route of routes) {
        process.stdout.write('[' + route.toString() + ']\n');
    }
});

/*
    This function calculates the distance (in minutes) between two points
*/
function calculateMinutes(x1: number, y1: number, x2: number, y2: number): number {
    const dx = x1 - x2;
    const dy = y1 - y2;
    return Math.sqrt(dx * dx + dy * dy);
}

/*
    This helper function parses a "(x,y)" string into a coordinate pair
*/
function parseCoordinate(str: string): [number, number] {
    const parts = str.replace('(', '').replace(')', '').split(',');
    return [parseFloat(parts[0]), parseFloat(parts[1])];
}

/*
    This function parses the data from the file passed in into a list of jobs
*/
function parseFile(lines: string[]): Job[] {
    const jobs: Job[] = [];
    const startsWithDigit = /^\d/;

    for (const line of lines) {
        const trimmed = line.trim();
        if (!startsWithDigit.test(trimmed)) {
            continue;
        }

        const [idPart, pickupPart, dropoffPart] = trimmed.split(/\s+/);
        jobs.push({
            id: parseInt(idPart, 10),
            pickup: parseCoordinate(pickupPart),
            dropoff: parseCoordinate(dropoffPart),
        });
    }

    return jobs;
}

/*
    This function returns the total drive time (in minutes) for a driver
    that starts at the depot, runs the given jobs in order, and returns home
*/
function scheduleMinutes(route: number[], jobById: Map<number, Job>): number {
    let minutes = 0;
    let position: [number, number] = [0, 0];

    for (const id of route) {
        const job = jobById.get(id)!;
        minutes += calculateMinutes(position[0], position[1], job.pickup[0], job.pickup[1]);
        minutes += calculateMinutes(job.pickup[0], job.pickup[1], job.dropoff[0], job.dropoff[1]);
        position = job.dropoff;
    }

    minutes += calculateMinutes(position[0], position[1], 0, 0);
    return minutes;
}

/*
    This function attempts to merge routes together (in either order) whenever
    the combined route still fits within the daily drive time budget, reducing
    the number of drivers needed since each driver adds a large fixed cost
*/
function mergeRoutes(routes: number[][], jobById: Map<number, Job>): void {
    let merged = true;

    while (merged) {
        merged = false;

        for (let i = 0; i < routes.length && !merged; i++) {
            for (let j = i + 1; j < routes.length && !merged; j++) {
                const forward = routes[i].concat(routes[j]);
                const backward = routes[j].concat(routes[i]);

                const forwardMinutes = scheduleMinutes(forward, jobById);
                const backwardMinutes = scheduleMinutes(backward, jobById);

                const best = forwardMinutes <= backwardMinutes ? forward : backward;
                const bestMinutes = Math.min(forwardMinutes, backwardMinutes);

                if (bestMinutes <= totalDayDriveMinutes) {
                    routes[i] = best;
                    routes.splice(j, 1);
                    merged = true;
                }
            }
        }
    }
}

/*
    This function builds routes for each driver by greedily picking, at each
    step, the nearest remaining job that still fits within that driver's
    remaining daily drive time. Once no remaining job fits, a new driver
    starts from the depot. A merge pass then tries to combine routes to
    further reduce the number of drivers needed.
*/
function buildRoutes(jobs: Job[]): number[][] {
    const jobById = new Map<number, Job>(jobs.map((job) => [job.id, job]));
    const remaining = new Set(jobs.map((_, index) => index));
    const routes: number[][] = [];

    while (remaining.size > 0) {
        const route: number[] = [];
        let position: [number, number] = [0, 0];
        let minutesUsed = 0;

        while (true) {
            let bestIndex = -1;
            let bestDistanceToPickup = Infinity;

            for (const index of remaining) {
                const job = jobs[index];
                const toPickup = calculateMinutes(position[0], position[1], job.pickup[0], job.pickup[1]);
                const tripMinutes = calculateMinutes(job.pickup[0], job.pickup[1], job.dropoff[0], job.dropoff[1]);
                const homeMinutes = calculateMinutes(job.dropoff[0], job.dropoff[1], 0, 0);
                const totalIfAssigned = minutesUsed + toPickup + tripMinutes + homeMinutes;

                if (totalIfAssigned <= totalDayDriveMinutes && toPickup < bestDistanceToPickup) {
                    bestDistanceToPickup = toPickup;
                    bestIndex = index;
                }
            }

            if (bestIndex === -1) {
                break;
            }

            const job = jobs[bestIndex];
            const toPickup = calculateMinutes(position[0], position[1], job.pickup[0], job.pickup[1]);
            const tripMinutes = calculateMinutes(job.pickup[0], job.pickup[1], job.dropoff[0], job.dropoff[1]);

            minutesUsed += toPickup + tripMinutes;
            position = job.dropoff;
            route.push(job.id);
            remaining.delete(bestIndex);
        }

        if (route.length === 0) {
            // Safety valve: a lone job's home-to-home trip exceeds the daily budget by itself.
            const [index] = remaining;
            route.push(jobs[index].id);
            remaining.delete(index);
        }

        routes.push(route);
    }

    mergeRoutes(routes, jobById);

    return routes;
}
