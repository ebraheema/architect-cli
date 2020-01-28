git add .
git commit -m "updating"
git push origin tag-testing
git push --delete origin v1.0.0
git tag -d v1.0.0
git tag -a v1.0.0 -m "testing binary uploads"
git push origin v1.0.0
