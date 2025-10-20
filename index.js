
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');

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
    const usersCollection = client.db("HostelHubDB").collection("users");
    const reviewsCollection = client.db("HostelHubDB").collection('reviews');

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


    app.get('/meals', async (req, res) => {
      try {
        const { search, category, minPrice, maxPrice, page = 1, limit = 10 } = req.query;

        // Build query object
        const query = {};

        // 1️⃣ Search functionality
        if (search) {
          query.$or = [
            { title: { $regex: search, $options: 'i' } },
            { description: { $regex: search, $options: 'i' } },
            { ingredients: { $regex: search, $options: 'i' } },
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

        const pageNum = parseInt(page);
        const limitNum = parseInt(limit);

        // Count total meals after filtering
        const total = await mealsCollection.countDocuments(query);

        // Fetch meals for current page
        const meals = await mealsCollection
          .find(query)
          .sort({ _id: -1 })
          .skip((pageNum - 1) * limitNum)
          .limit(limitNum)
          .toArray();

        // Determine next page
        const nextPage = pageNum * limitNum < total ? pageNum + 1 : null;

        res.send({ meals, nextPage });
      } catch (error) {
        console.error("Error fetching meals:", error);
        res.status(500).send({ message: "Failed to fetch meals" });
      }
    });

    // get the specific meal details base on the id
    app.get('/meals/:id', async (req, res) => {
      const id = req.params.id;
      try {

        const meal = await mealsCollection.findOne({ _id: new ObjectId(id) });
        if (!meal) {
          return res.status(404).sendDate({ message: 'Meal not found' })
        }
        res.send(meal);
      }
      catch (error) {
        console.log(error);
        return res.status(500).send({ message: 'Server error' })
      }
    })

    app.patch('/meals/:id/like', async (req, res) => {
      const mealId = req.params.id;
      try {
        const result = await mealsCollection.updateOne(
          { _id: new ObjectId(mealId) },
          { $inc: { likes: 1 } }
        );
        res.send(result);
      }
      catch (error) {
        res.status(500).send({ message: 'Failed to update like', error });
      }
    })

    // get the users info
    app.get('/users', async (req, res) => {
      try {
        const result = await usersCollection.find().sort({ _id: -1 }).toArray();
        res.send(result);
      }
      catch (error) {
        // console.error(error);
        res.status(500).send({ message: 'Failed to fetch users' });
      }
    })

    //  get users data for user and admin Dashboard
    app.get('/users/:email', async (req, res) => {
      const email = req.params.email;
      const result = await usersCollection.findOne({ email });
      res.send(result);
    })
    //update user info set in DB
    app.patch('/users/role/:email', async (req, res) => {
      const email = req.params.email;
      const { role } = req.body;
      const result = await usersCollection.updateOne(
        { email },
        { $set: { role } }
      );
      res.send(result);
    });
    // GET user role by email
    app.get('/users/:email/role', async (req, res) => {
      try {
        const email = req.params.email;

        // Find the user by email
        const user = await usersCollection.findOne({ email });

        if (!user) {
          return res.status(404).send({ message: 'User not found' });
        }

        // Return the role
        res.send({ role: user.role || 'user' });
      } catch (error) {
        console.error(error);
        res.status(500).send({ message: 'Failed to get user role' });
      }
    });

    // Save user info in DB
    app.post('/users', async (req, res) => {
      const email = req.body.email;
      const userExists = await usersCollection.findOne({ email });
      if (userExists) {
        return res.status(200).send({ message: 'user already exists', inserted: false });
      }
      const user = req.body;

      const result = await usersCollection.insertOne(user);

      res.send(result);
    })

    //reviews collection
    app.post('/reviews', async (req, res) => {
      const review = req.body;
      const mealId = review.mealId;

      try {
        // Save review to new collection "reviews"
        const reviewResult = await reviewsCollection.insertOne(review);

        // Increase reviewCount in meals collection
        await mealsCollection.updateOne(
          { _id: new ObjectId(mealId) },
          { $inc: { reviews_count: 1 } }
        );

        res.send({ success: true, reviewResult });
      } catch (error) {
        console.error(error);
        res.status(500).send({ success: false, message: "Failed to post review" });
      }
    })

    //get specific users reviews
    // Get specific user's reviews
    app.get('/reviews/:email', async (req, res) => {
      const email = req.params.email;


      const query={
        userEmail: email
      }
      try {
        // Find all reviews that match the email
        const result = await reviewsCollection.find(query ).toArray();

        // Send them back as JSON
        res.send(result);
      } catch (error) {
        console.error("Error fetching user reviews:", error);
        res.status(500).send({ message: "Server Error" });
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