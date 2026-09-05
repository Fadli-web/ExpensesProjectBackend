module.exports = (req, res) => {
  res.status(200).json({
    status: "ok",
    message: "Expenses Note Backend API is running",
    timestamp: new Date().toISOString()
  });
};
