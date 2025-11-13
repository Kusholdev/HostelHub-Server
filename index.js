
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const admin = require("firebase-admin");

dotenv.config();

const stripe = require('stripe')(process.env.Payment_GateWay_Key);

const app = express();
const PORT = process.env.PORT || 5000;

// middleWar
app.use(cors());
app.use(express.json());

var serviceAccount = require("./firebase_Key.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});


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
    const paymentsCollection = client.db("HostelHubDB").collection('payment');
    const RequestedMeals = client.db("HostelHubDB").collection('mealRequest');
    const UpComingMealsCollection = client.db("HostelHubDB").collection('upComingMeals');

    //middleWar
    const verifyFBToken = async (req, res, next) => {


      const authHeader = req.headers.authorization;
      if (!authHeader) {
        return res.status(401).send({ message: 'unauthorized access' })
      }

      const token = authHeader.split(' ')[1];
      if (!token) {
        return res.status(401).send({ message: 'unauthorized access' })
      }

      // verify The ToKen

      try {
        // const decoded = await admin.auth().
        const decoded = await admin.auth().verifyIdToken(token);
        req.decoded = decoded;
        next();

      }
      catch (error) {
        return res.status(403).send({ message: 'forbidden access' })

      }
    }
    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email }
      const user = await usersCollection.findOne(query);
      if (!user || user.role !== 'admin') {
        return res.status(403).send({ message: 'forbidden access' })
      }
      next();
    }





    // add meal form form
    app.post('/meals', verifyFBToken, verifyAdmin, async (req, res) => {
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


    app.get('/meals', verifyFBToken, async (req, res) => {

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

    //Only for admin for post Upcoming meals - Admin
    app.post('/upComingMeals', async (req, res) => {
      try {

        const meal = req.body;
        const result = await UpComingMealsCollection.insertOne(meal);

        res.send(result);


      }
      catch (error) {
        console.log(error);
        res.status(500).send({ message: 'Failed to add meal' });
      }
    })
    // GET all upcoming meals sorted by likes - Admin ( add Token Here)
    app.get('/upcomingMeals', async (req, res) => {
      try {
        const meals = await UpComingMealsCollection
          .find()
          .sort({ likes: -1 }) // descending order
          .toArray();

        res.send(meals);
      } catch (error) {
        console.error('Error fetching upcoming meals:', error);
        res.status(500).send({ message: 'Server Error' });
      }
    });

    //Delete from upcoming meals
    app.delete("/upcomingMeals/:id", async (req, res) => {
      const id = req.params.id;
      const result = await UpComingMealsCollection.deleteOne({ _id: new ObjectId(id) });
      res.send(result);
    });


    //users to see the upComing Meals
    app.get('/allUpComingMeals', async (req, res) => {
      try {
        const upComingMeals = await UpComingMealsCollection
          .find()
          .sort({ _id: -1 })
          .toArray();

        res.send(upComingMeals);
      }
      catch (error) {
        console.error('Error fetching upcoming meals:', error);
        res.status(500).send({ message: 'Server Error' });
      }
    })

    app.get('/allUpcomingMeals/:id', async (req, res) => {
      const id = req.params.id;
      try {

        const meal = await UpComingMealsCollection.findOne({ _id: new ObjectId(id) });
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
    app.get('/users/:email/Badge', async (req, res) => {
      try {
        const email = req.params.email;
        const user = await usersCollection.findOne({ email });

        if (!user) {
          return res.status(404).send({ message: 'User not found' });
        }

        // ✅ Return the Badge correctly
        res.send({ Badge: user?.Badge });
      } catch (error) {
        console.error(error);
        res.status(500).send({ message: 'Failed to get user Badge' });
      }
    });


    // app.patch("/allUpcomingMeals/:id/like", verifyFBToken, async (req, res) => {
    //   try {
    //     const { id } = req.params;
    //      console.log(id)
    //     // if (!ObjectId.isValid(id))
    //     //   return res.status(400).json({ message: "Invalid meal ID" });

    //     const userEmail = req.user?.email;
    //     console.log(req.user)
    //     if (!userEmail) return res.status(401).json({ message: "Unauthorized" });

    //     // Find user
    //     const user = await usersCollection.findOne({ email: userEmail });
    //     if (!user) return res.status(404).json({ message: "User not found" });

    //     // ✅ Only premium users can like
    //     const premiumBadges = ["Silver", "Gold", "Platinum"];
    //     if (!premiumBadges.includes(user?.Badge)) {
    //       return res
    //         .status(403)
    //         .json({ message: "Only premium users can like meals." });
    //     }

    //     // Find meal
    //     const meal = await mealsCollection.findOne({ _id: new ObjectId(id) });
    //     if (!meal) return res.status(404).json({ message: "Meal not found" });

    //     // ✅ Increment likes without checking if already liked
    //     await mealsCollection.updateOne(
    //       { _id: new ObjectId(id) },
    //       { $inc: { likes: 1 }, $push: { likedUsers: userEmail } }
    //     );

    //     res.json({ message: "Liked successfully" });
    //   } catch (err) {
    //     console.error("Like route error:", err);
    //     res.status(500).json({ message: "Server error" });
    //   }
    // });

    app.patch("/allUpcomingMeals/:id/like", async (req, res) => {
      try {
        const { id } = req.params;
        const { email } = req.body;  // <-- frontend must send { email: user.email }
    
        if (!email) return res.status(400).json({ message: "Email is required" });
    
        const user = await usersCollection.findOne({ email });
    
        if (!user) return res.status(404).json({ message: "User not found" });
    
        const premiumBadges = ["Silver", "Gold", "Platinum"];
        if (!premiumBadges.includes(user.Badge)) {
          return res.status(403).json({ message: "Only premium users can like meals." });
        }
    
        await UpComingMealsCollection.updateOne(
          { _id: new ObjectId(id) },
          { $inc: { likes: 1 } }
        );
    
        res.json({ message: "Liked successfully" });
      } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Server error" });
      }
    });
    



    // ?sortBy=likes or ?sortBy=reviews_count
    app.get('/allMeals', verifyFBToken, verifyAdmin, async (req, res) => {
      try {
        const sortBy = req.query.sortBy || '';
        const order = req.query.order === 'asc' ? 1 : -1;

        let sortQuery = {};

        if (sortBy === 'likes') sortQuery = { likes: order };
        else if (sortBy === 'reviews_count') sortQuery = { reviews_count: order };
        else sortQuery = { _id: -1 }; // default sorting by latest

        const meals = await mealsCollection.find().sort(sortQuery).toArray();

        res.send(meals);
      } catch (error) {
        console.error(error);
        res.status(500).send({ message: 'Failed to fetch meals' });
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

    // get the users info (with search support)
    app.get('/users', async (req, res) => {
      try {
        const search = req.query.search || ''; // ?search=keyword

        // Create a filter for username or email
        const query = {
          $or: [
            { name: { $regex: search, $options: 'i' } },  // case-insensitive name search
            { email: { $regex: search, $options: 'i' } }  // case-insensitive email search
          ]
        };

        const result = await usersCollection
          .find(search ? query : {}) // if no search, show all
          .sort({ _id: -1 })
          .toArray();

        res.send(result);
      } catch (error) {
        console.error(error);
        res.status(500).send({ message: 'Failed to fetch users' });
      }
    });

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


    // Get specific user's reviews
    app.get('/reviews/:email', async (req, res) => {
      const email = req.params.email;

      try {
        // get all reviews of the user
        const reviews = await reviewsCollection.find({ userEmail: email }).toArray();

        //  Add likes from mealData for each review
        const reviewsWithLikes = await Promise.all(
          reviews.map(async (review) => {
            const meal = await mealsCollection.findOne({ _id: new ObjectId(review.mealId) });
            return {
              ...review,
              likes: meal?.likes || 0,  // include likes from mealData
            };
          })
        );

        res.send(reviewsWithLikes);
      } catch (error) {
        console.error("Error fetching user reviews:", error);
        res.status(500).send({ message: "Server Error" });
      }
    });


    // Update a specific review comment
    app.put('/reviews/:id', async (req, res) => {
      const id = req.params.id;
      const { comment } = req.body;

      try {
        // Convert id to ObjectId
        const filter = { _id: new ObjectId(id) };

        // Define the update
        const updateDoc = {
          $set: {
            comment: comment,
            updatedAt: new Date(),
          },
        };

        // Perform the update
        const result = await reviewsCollection.updateOne(filter, updateDoc);

        if (result.modifiedCount > 0) {
          res.send({ success: true, message: "Review updated successfully" });
        } else {
          res.status(404).send({ success: false, message: "Review not found or no changes made" });
        }
      } catch (error) {
        console.error("Error updating review:", error);
        res.status(500).send({ success: false, message: "Server error while updating review" });
      }
    });
    app.delete('/reviews/:id', async (req, res) => {
      const id = req.params.id;
      try {
        const query = { _id: new ObjectId(id) };
        const result = await reviewsCollection.deleteOne(query);
        res.send(result);
      } catch (error) {
        console.error("Error deleting review:", error);
        res.status(500).send({ message: "Server Error" });
      }
    });
    app.get('/allReviews', verifyFBToken, verifyAdmin, async (req, res) => {

      try {
        const reviews = await reviewsCollection.find().toArray();

        const reviewsAndMeal = await Promise.all(
          reviews.map(async (review) => {
            const meal = await mealsCollection.findOne({ _id: new ObjectId(review.mealId) });
            return {
              _id: review._id,
              userName: review.userName,
              userEmail: review.userEmail,
              comment: review.comment,
              mealTitle: meal?.title || "Meal not found",
              likes: meal?.likes || 0,
              reviews_count: meal?.reviews_count || 0
            };
          })
        )
        res.send(reviewsAndMeal);

      }
      catch (error) {
        console.error(error);
        res.status(500).send({ message: 'Failed to fetch reviews' });
      }
    })

    // get the plan form mealsDetailsPage
    app.get("/userPlan/:email", async (req, res) => {
      try {
        const email = req.params.email;
        if (!email) {
          return res.status(400).send({ message: "Email is required" });
        }


        const latestPayment = await paymentsCollection
          .find({ email })
          .sort({ date: -1 })
          .limit(1)
          .toArray();

        if (!latestPayment || latestPayment.length === 0) {

          return res.send({ plan: "Bronze" });
        }

        // Return the user's plan from latest payment
        res.send({ plan: latestPayment[0].plan });
      } catch (error) {
        console.error("Error fetching user plan:", error);
        res.status(500).send({ message: "Internal Server Error" });
      }
    });

    app.post("/mealRequests", async (req, res) => {
      const mealRequest = req.body;
      mealRequest.status = mealRequest.status || "pending";
      mealRequest.requestedAt = new Date(mealRequest.requestedAt || Date.now());

      const result = await RequestedMeals.insertOne(mealRequest);
      res.send(result);
    });

    // Get meal requests for a specific user
    app.get("/mealRequests/:email", async (req, res) => {
      try {
        const email = req.params.email;
        if (!email) {
          return res.status(400).send({ message: "Email is required" });
        }


        const userRequests = await RequestedMeals
          .find({ userEmail: email })
          .sort({ requestedAt: -1 })
          .toArray();

        if (!userRequests || userRequests.length === 0) {
          return res.status(404).send({ message: "No meal requests found for this user." });
        }

        res.send(userRequests);
      } catch (error) {
        console.error("Error fetching meal requests:", error);
        res.status(500).send({ message: "Internal Server Error" });
      }
    });

    //get mealRequest for admin to show 
    app.get('/allMealRequest', async (req, res) => {
      try {
        const { search } = req.query;
        let query = {};

        if (search) {
          query = {
            $or: [
              { userName: { $regex: search, $options: "i" } },
              { userEmail: { $regex: search, $options: "i" } }
            ]
          };
        }

        const requests = await RequestedMeals.find(query).toArray();

        if (!requests.length) {
          return res.status(404).send({ message: "No meal requests found." });
        }

        res.send(requests);
      } catch (error) {

        res.status(500).send({ message: "Internal server error." });
      }
    });
    app.patch('/serveMeal/:id', async (req, res) => {
      try {
        const id = req.params.id;
        const result = await RequestedMeals.updateOne(
          { _id: new ObjectId(id) },
          {
            $set:
              { status: "Delivered" }
          }
        );

        if (result.modifiedCount === 0) {
          return res.status(404).send({ message: "Meal request not found." });
        }

        res.send({ message: "Meal served successfully." });
      } catch (error) {
        console.error("Error updating meal status:", error);
        res.status(500).send({ message: "Internal server error." });
      }
    });


    // Deleting the request
    app.delete('/mealRequests/:id', async (req, res) => {
      try {
        const { id } = req.params;

        if (!ObjectId.isValid(id)) {
          return res.status(400).send({ message: "Invalid request ID" });
        }

        const result = await RequestedMeals.deleteOne({ _id: new ObjectId(id) });

        if (result.deletedCount === 0) {
          return res.status(404).send({ message: "Meal request not found" });
        }

        res.send({ message: "Meal request deleted successfully" });
      }
      catch (error) {
        console.error("Error deleting meal request:", error);
        res.status(500).send({ message: "Internal Server Error" });
      }
    })
    app.get('/paymentHistory/:email', async (req, res) => {
      try {
        const email = req.params.email;

        if (!email) {
          return res.status(400).send({ message: 'Email is Required' })
        }
        const payments = await paymentsCollection.find({ email }).sort({ date: -1 }).toArray();

        if (!payments || payments.length === 0) {
          return res.status(404).send({ message: "No payment history found for this user." });
        }

        res.send(payments);
      }
      catch (error) {
        console.error("Error fetching payment history:", error);
        res.status(500).send({ message: "Internal Server Error" });
      }

    })


    // Save payment info to DB
    app.post('/payments', async (req, res) => {
      try {
        const { email, plan, amount, transactionId, date } = req.body;

        if (!email || !plan || !amount || !transactionId) {
          return res.status(400).send({ message: "Missing required fields" });
        }

        const paymentData = {
          email,
          plan,
          amount,
          transactionId,
          date: date ? new Date(date) : new Date()
        };

        // Save payment
        const result = await paymentsCollection.insertOne(paymentData);

        // Update user role based on plan
        const updateUserRole = await usersCollection.updateOne(
          { email },
          {
            $set: {
              Badge: plan
            }
          }
        );

        res.send(result);
      } catch (error) {
        console.error("Error saving payment:", error);
        res.status(500).send({
          success: false,
          message: "Failed to save payment"
        });
      }
    });


    app.post('/create-payment-intent', async (req, res) => {
      const amountInCents = req.body.amountInCents
      try {
        const paymentIntent = await stripe.paymentIntents.create({
          amount: amountInCents, // Amount in cents
          currency: 'usd',
          payment_method_types: ['card'],
        });

        res.json({ clientSecret: paymentIntent.client_secret });
      } catch (error) {
        res.status(500).json({ error: error.message });
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