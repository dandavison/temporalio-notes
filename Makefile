img/%.svg: diagrams/%.d2
	d2 --sketch $< $@

tla:
	rm -rf img/tla-*.svg img/nexus-*.svg
	for f in diagrams/tla-*.d2 diagrams/nexus-*.d2; do \
		make img/$$(basename $$f .d2).svg; \
	done
	scripts/create-html html/top-level-activity.html 3 img/tla-*.svg img/nexus-*.svg
