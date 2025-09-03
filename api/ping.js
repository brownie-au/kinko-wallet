// Minimal health check for Vercel Functions
module.exports = (req, res) => {
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.end('pong');
};
