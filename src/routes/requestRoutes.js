const express = require('express');
const { protect } = require('../middleware/authMiddleware');
const requestController = require('../controllers/requestController');

const buildRouter = (controller) => {
  const router = express.Router();
  router.use(protect);
  router.post('/', controller.apply);
  router.get('/my', controller.listMine);
  router.patch('/:id/approve', controller.approve);
  router.patch('/:id/reject', controller.reject);
  return router;
};

module.exports = {
  leaveRoutes: buildRouter(requestController.leave),
  wfhRoutes: buildRouter(requestController.wfh),
};