let monthlyTsaCalls = 0;
let monthlyTsaMonth = new Date().getMonth();

function bumpTsaCallCount() {
  const m = new Date().getMonth();
  if (m !== monthlyTsaMonth) {
    monthlyTsaMonth = m;
    monthlyTsaCalls = 0;
  }
  monthlyTsaCalls += 1;
}

function getTsaCallsThisMonth() {
  const m = new Date().getMonth();
  if (m !== monthlyTsaMonth) {
    monthlyTsaMonth = m;
    monthlyTsaCalls = 0;
  }
  return monthlyTsaCalls;
}

module.exports = { bumpTsaCallCount, getTsaCallsThisMonth };
