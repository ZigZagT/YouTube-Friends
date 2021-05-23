import 'newrelic';
import express from 'express';
import next from 'next';
import { sendToPub, textParser } from './legacy.js';
import bodyParser from 'body-parser';

const PORT = process.env.PORT || 5000;
const dev = process.env.NODE_ENV !== 'production';
const nextApp = next({ dev });
const handle = nextApp.getRequestHandler();

const app = express();
const textRouter = express.Router();
textRouter.use(bodyParser.text());
app.use('/text', textRouter);

textRouter.post('/', async (req, res) => {
    const config = textParser(req.body);
    return await sendToPub(config, res);
});

(async () => {
    await nextApp.prepare();
    app.use(handle);
    app.listen(PORT, '0.0.0.0', (err) => {
        if (err) throw err;
        console.log(`> Ready on http://localhost:${PORT}`); // eslint-disable-line no-console
    });
})();
