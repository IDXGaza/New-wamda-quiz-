import { initializeApp } from 'firebase/app';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import fs from 'fs';

const firebaseConfig = {
  "apiKey": "AIzaSyDEl0FlaM1pZ-iXTyjZUVw0N1gHNbxXfFE",
  "authDomain": "new-wamda-quizy-app.firebaseapp.com",
  "databaseURL": "https://new-wamda-quizy-app-default-rtdb.asia-southeast1.firebasedatabase.app",
  "projectId": "new-wamda-quizy-app",
  "storageBucket": "new-wamda-quizy-app.firebasestorage.app",
  "messagingSenderId": "982724181522",
  "appId": "1:982724181522:web:f95bc872e118730157e2cb",
  "measurementId": "G-03RE36ZRFJ"
};

const app = initializeApp(firebaseConfig);
const storage = getStorage(app);

async function testStorage() {
  try {
    const storageRef = ref(storage, 'test.txt');
    const blob = new Blob(["test"], { type: "text/plain" });
    await uploadBytes(storageRef, blob);
    const url = await getDownloadURL(storageRef);
    console.log("Success:", url);
  } catch (e) {
    console.error("Error:", e);
  }
}

testStorage();
