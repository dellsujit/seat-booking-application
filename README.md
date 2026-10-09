Burst Test — 50,000 Requests

The project includes a stress test to verify reservation behavior under high concurrency and ensure that a seat cannot be booked more than once.

How to Run

Clone the repository and install dependencies:

git clone https://github.com/dellsujit/seat-booking-application.git
cd seat-booking-application
npm ci

Configure the target API and admin token (Windows CMD):

set BASE_URL=https://seat-booking-application-nvfa.onrender.com
set ADMIN_TOKEN=dev-admin-token

Run the stress test:

npx tsx tests/stress-50000.ts

The script creates a test show and sends 50,000 reservation requests with a concurrency of 500.

Expected result: One successful reservation, 49,999 conflicts, and zero unexpected server errors.
