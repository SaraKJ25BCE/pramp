const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const passport = require('passport');
const path = require('path');
require('dotenv').config();

require('./config/passport');

const authRoutes = require('./routes/auth');
const passportRoutes = require('./routes/passport');
const stampRoutes = require('./routes/stamps');
const verifyRoutes = require('./routes/verify');
const shareRoutes = require('./routes/share');
const monitorRoutes = require('./routes/monitor');
const takedownRoutes = require('./routes/takedown');
const registryRoutes = require('./routes/registry');
const versionsRoutes = require('./routes/versions');

const app = express();

app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({ origin: process.env.CLIENT_URL, credentials: true }));
app.use(morgan('dev'));
app.use(express.json());
app.use(passport.initialize());

app.use('/share', cors());
app.use('/registry', cors());
app.use('/uploads', cors(), express.static(path.join(__dirname, '../uploads')));

app.use('/auth', authRoutes);
app.use('/passport', passportRoutes);
app.use('/stamps', stampRoutes);
app.use('/verify', verifyRoutes);
app.use('/share', shareRoutes);
app.use('/monitor', monitorRoutes);
app.use('/takedowns', takedownRoutes);
app.use('/registry', registryRoutes);
app.use('/versions', versionsRoutes);

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
  });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
