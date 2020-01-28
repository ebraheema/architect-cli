git add .
git commit -m "updating"
git push origin tag-testing
git push --delete origin v1-test
git tag -d v1-test
git tag -a v1-test -m "testing binary uploads"
git push origin v1-test
