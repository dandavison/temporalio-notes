img/%.svg: diagrams/%.d2
	d2 --sketch $< $@

standalone-activities:
	rm -rf img/sa-*.svg
	for f in diagrams/sa-*.d2; do \
		make img/$$(basename $$f .d2).svg; \
	done
	scripts/create-html "img/sa-*.svg" html/standalone-activities.html 2

nexus:
	rm -rf img/nexus-*.svg
	for f in diagrams/nexus-*.d2; do \
		make img/$$(basename $$f .d2).svg; \
	done
	scripts/create-html "img/nexus-*.svg" html/nexus.html 2
