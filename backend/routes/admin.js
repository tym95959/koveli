const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { verifyToken, isAdmin } = require('../middleware/auth');

// All admin routes require authentication and admin privileges
router.use(verifyToken);
router.use(isAdmin);

router.get('/tables', adminController.getTables);
router.post('/tables', adminController.createTable);
router.delete('/tables/:tableName', adminController.dropTable);
router.get('/tables/:tableName/data', adminController.getTableData);
router.post('/tables/:tableName/data', adminController.insertData);
router.put('/tables/:tableName/data/:id', adminController.updateData);
router.delete('/tables/:tableName/data/:id', adminController.deleteData);

module.exports = router;
