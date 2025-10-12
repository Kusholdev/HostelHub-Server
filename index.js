
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { MongoClient, ServerApiVersion } = require('mongodb');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// middleWar
app.use(cors());
app.use(express.json());


const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.hl3uycw.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();

    const mealsCollection = client.db("HostelHubDB").collection("MealData");



    // add meal form form
    app.post('/meals', async (req, res) => {
      try {

        const meal = req.body;
        const result = await mealsCollection.insertOne(meal);

        res.send(result);


      }
      catch (error) {
        console.log(error);
        res.status(500).send({ message: 'Failed to add meal' });
      }

    })

    // GET /meals?search=&category=&minPrice=&maxPrice=
    app.get('/meals', async (req, res) => {
      try {
        const { search, category, minPrice, maxPrice } = req.query;

        // Build query object
        const query = {};

        // 1️⃣ Search functionality
        if (search) {
          query.$or = [
            { title: { $regex: search, $options: 'i' } },
            { description: { $regex: search, $options: 'i' } },
            { ingredients: { $regex: search, $options: 'i' } }, // works if ingredients stored as comma string
          ];
        }

        // 2️⃣ Filter by category
        if (category) {
          query.category = category;
        }

        // 3️⃣ Filter by price range
        if (minPrice || maxPrice) {
          query.price = {};
          if (minPrice) query.price.$gte = parseFloat(minPrice);
          if (maxPrice) query.price.$lte = parseFloat(maxPrice);
        }

        // Fetch from MongoDB
        const meals = await mealsCollection.find(query).toArray();

        // Send response
        res.send(meals);

      } catch (error) {
        console.error("Error fetching meals:", error);
        res.status(500).send({ message: "Failed to fetch meals" });
      }
    });

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get('/', (req, res) => {
  res.send('Hostel Hub Server!')
})

app.listen(PORT, () => {
  console.log(`Hostel Hub Server running on port :  ${PORT}`)
})