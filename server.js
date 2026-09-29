const app = require('./src/server');

if (require.main === module) {
  const port = process.env.PORT || 5000;
  app.listen(port, () => {
    console.log(`PeoplePulse HRMS Server running on port ${port}`);
  });
}

module.exports = app;


